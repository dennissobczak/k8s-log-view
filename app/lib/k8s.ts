//'use server';

import { existsSync } from 'node:fs';

import * as k8s from '@kubernetes/client-node';

const SERVICEACCOUNT_TOKEN_PATH =
    '/var/run/secrets/kubernetes.io/serviceaccount/token';

/**
 * Detect whether the process is running inside a Kubernetes pod. The kubelet
 * injects `KUBERNETES_SERVICE_HOST`/`KUBERNETES_SERVICE_PORT` into every
 * container, and projects a service-account token onto the filesystem. We
 * require both so we don't mistake a stray env var for an in-cluster context.
 */
function isInCluster(): boolean {
    return (
        Boolean(process.env.KUBERNETES_SERVICE_HOST) &&
        Boolean(process.env.KUBERNETES_SERVICE_PORT) &&
        existsSync(SERVICEACCOUNT_TOKEN_PATH)
    );
}

// Log the resolved connection details exactly once (this module creates a
// fresh client per call, so without the guard we'd spam the pod logs).
let connectionLogged = false;

/**
 * Force the current cluster's API server back to `https://`.
 *
 * The in-cluster API server is *always* TLS-backed — its CA is mounted next to
 * the service-account token — but `@kubernetes/client-node` can end up with an
 * `http://` server URL two different ways, and in both cases `createAgent()`
 * throws "HTTP protocol is not allowed when skipTLSVerify is not set or false":
 *
 *   1. `loadFromCluster()` derives the scheme from `KUBERNETES_SERVICE_PORT`
 *      and downgrades to `http` when that port is 80/8080/8001.
 *   2. `loadFromDefault()`, finding no kubeconfig and no token file, falls back
 *      to a hard-coded `http://localhost:8080`.
 *
 * Rewriting the scheme is safe in both: an HTTPS request to the real API server
 * succeeds, while the bogus `localhost:8080` fallback fails loudly either way.
 */
function forceHttpsServer(kc: k8s.KubeConfig): void {
    const cluster = kc.getCurrentCluster();
    if (!cluster || !cluster.server.startsWith('http://')) return;
    const fixed: k8s.Cluster = {
        ...cluster,
        server: cluster.server.replace(/^http:\/\//, 'https://'),
    };
    // Match by name rather than identity: robust even if a future client
    // version returns a copy from getCurrentCluster() instead of the live ref.
    kc.clusters = kc.clusters.map((c) => (c.name === cluster.name ? fixed : c));
}

/**
 * Load a `KubeConfig`, choosing in-cluster authentication (mounted
 * service-account token) when running inside a pod, and otherwise the local
 * kubeconfig (`~/.kube/config` or `$KUBECONFIG`). A fresh config is created per
 * call, matching the rest of this module.
 */
function loadKubeConfig(): k8s.KubeConfig {
    const kc = new k8s.KubeConfig();
    const inCluster = isInCluster();
    if (inCluster) {
        kc.loadFromCluster();
    } else {
        kc.loadFromDefault(); // reads ~/.kube/config or $KUBECONFIG
    }
    forceHttpsServer(kc);

    if (!connectionLogged) {
        connectionLogged = true;
        // One-time diagnostic so the pod logs reveal exactly which auth path
        // and server URL were chosen — the source of truth when debugging the
        // "HTTP protocol is not allowed" / "Could not reach the cluster" errors.
        console.log(
            '[k8s] connection resolved:',
            JSON.stringify({
                inCluster,
                server: kc.getCurrentCluster()?.server ?? null,
                KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST ?? null,
                KUBERNETES_SERVICE_PORT: process.env.KUBERNETES_SERVICE_PORT ?? null,
                tokenMounted: existsSync(SERVICEACCOUNT_TOKEN_PATH),
            }),
        );
    }

    return kc;
}

/**
 * Build a `CoreV1Api` client from the resolved kubeconfig. A fresh config +
 * client is created per call, matching the rest of this module.
 */
function getCoreV1Api(): k8s.CoreV1Api {
    return loadKubeConfig().makeApiClient(k8s.CoreV1Api);
}

export async function InitK8sClient() {
    const k8sApi = getCoreV1Api();

    k8sApi.listPodForAllNamespaces().then((res) => {
        console.log(res);

        res.items.flatMap((pod => {
            console.log(pod);
            console.log(pod.metadata?.name);
        }))

        console.log(res.items.entries.length);
    });
    
    k8sApi.listNamespace().then((res) => {
        //console.log(typeof res);
    });
}

export interface PodInfo {
    name: string;
    namespace: string;
    phase: string;
    ready: string; // e.g. "1/1"
    restarts: number;
    node: string;
    startTime: string | null;
    containers: string[];
    eventCount: number;
}

export async function ListPods(): Promise<PodInfo[]> {
    const k8sApi = getCoreV1Api();

    const [pods, events] = await Promise.all([
        k8sApi.listPodForAllNamespaces(),
        k8sApi.listEventForAllNamespaces(),
    ]);

    // Count events per pod, keyed by "namespace/name".
    const eventCounts = new Map<string, number>();
    for (const ev of events.items) {
        const obj = ev.involvedObject;
        if (obj?.kind !== "Pod" || !obj.name || !obj.namespace) continue;
        const key = `${obj.namespace}/${obj.name}`;
        eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
    }

    return pods.items.map((pod) => {
        const containers = pod.status?.containerStatuses ?? [];
        const readyCount = containers.filter((c) => c.ready).length;
        const restarts = containers.reduce((sum, c) => sum + (c.restartCount ?? 0), 0);
        const key = `${pod.metadata?.namespace}/${pod.metadata?.name}`;

        return {
            name: pod.metadata?.name ?? "<unknown>",
            namespace: pod.metadata?.namespace ?? "default",
            phase: pod.status?.phase ?? "Unknown",
            ready: `${readyCount}/${containers.length}`,
            restarts,
            node: pod.spec?.nodeName ?? "—",
            startTime: pod.status?.startTime
                ? new Date(pod.status.startTime).toISOString()
                : null,
            containers: (pod.spec?.containers ?? []).map((c) => c.name),
            eventCount: eventCounts.get(key) ?? 0,
        };
    });
}

export async function ListNamespaces(): Promise<string[]> {
    const k8sApi = getCoreV1Api();

    const res = await k8sApi.listNamespace();

    return res.items
        .map((ns) => ns.metadata?.name)
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b));
}

export interface ClusterLatency {
    /** API server Service name, e.g. "kubernetes.default.svc" — for display. */
    service: string;
    /** Number of probes that completed successfully. */
    samples: number;
    minMs: number;
    avgMs: number;
    maxMs: number;
}

/**
 * Measure round-trip network latency to the Kubernetes API server.
 *
 * We hit the `/version` endpoint several times over the *same* authenticated
 * client the rest of the app uses (so no separate auth/TLS plumbing to get
 * wrong), and report min/avg/max of the round-trips. `/version` returns a tiny,
 * static payload and does almost no server-side work, so the timing is
 * dominated by the network round-trip rather than API handling — the closest
 * proxy for "network latency in the cluster" we can measure from where this app
 * runs (a pod, or a workstation talking to the cluster).
 *
 * The first probe is treated as a warm-up (it pays TLS handshake / connection
 * setup cost) and is excluded from the stats when we have more than one sample.
 */
export async function MeasureClusterLatency(
    samples = 6
): Promise<ClusterLatency> {
    const kc = loadKubeConfig();
    // The API server is always fronted by the well-known `kubernetes` Service
    // in the `default` namespace, so report that rather than the resolved
    // IP:port from the kubeconfig.
    const service = "kubernetes.default.svc";
    const versionApi = kc.makeApiClient(k8s.VersionApi);

    const times: number[] = [];
    for (let i = 0; i < samples; i++) {
        const start = performance.now();
        await versionApi.getCode();
        times.push(performance.now() - start);
    }

    // Drop the warm-up probe (connection/TLS setup) once we have spares.
    const measured = times.length > 1 ? times.slice(1) : times;
    const sum = measured.reduce((a, b) => a + b, 0);

    return {
        service,
        samples: measured.length,
        minMs: Math.round(Math.min(...measured)),
        avgMs: Math.round(sum / measured.length),
        maxMs: Math.round(Math.max(...measured)),
    };
}

export interface EventInfo {
    type: string; // Normal | Warning
    reason: string;
    message: string;
    count: number;
    lastSeen: string | null;
}

export async function GetPodEvents(
    namespace: string,
    name: string
): Promise<EventInfo[]> {
    const k8sApi = getCoreV1Api();

    const events = await k8sApi.listNamespacedEvent({
        namespace,
        fieldSelector: `involvedObject.name=${name},involvedObject.kind=Pod`,
    });

    const toTime = (ev: k8s.CoreV1Event): number => {
        const t = ev.lastTimestamp ?? ev.eventTime ?? ev.firstTimestamp;
        return t ? new Date(t).getTime() : 0;
    };

    return events.items
        .sort((a, b) => toTime(a) - toTime(b))
        .map((ev) => {
            const last = ev.lastTimestamp ?? ev.eventTime ?? ev.firstTimestamp;
            return {
                type: ev.type ?? "Normal",
                reason: ev.reason ?? "",
                message: ev.message ?? "",
                count: ev.count ?? 1,
                lastSeen: last ? new Date(last).toISOString() : null,
            };
        });
}

export async function GetPodLogs(
    namespace: string,
    name: string,
    opts?: { container?: string; previous?: boolean; tailLines?: number }
): Promise<string> {
    const k8sApi = getCoreV1Api();

    return k8sApi.readNamespacedPodLog({
        name,
        namespace,
        container: opts?.container,
        previous: opts?.previous,
        tailLines: opts?.tailLines,
    });
}

export async function GetFirstPodLogs() {
    const k8sApi = getCoreV1Api();

    const pods = await k8sApi.listPodForAllNamespaces();

    // for the beginning, just get the logs from the first pod
    const pod = pods.items[1];

    const logs = await k8sApi.readNamespacedPodLog({
        name: pod.metadata!.name!,
        namespace: pod.metadata!.namespace!,
    });

    console.log(logs);

    return logs;
}

export async function GetFirstPodPreviousLogs() {
    const k8sApi = getCoreV1Api();

    const pods = await k8sApi.listPodForAllNamespaces();

    const pod = pods.items[1];

    // logs from the previously terminated container instance (kubectl logs --previous)
    const logs = await k8sApi.readNamespacedPodLog({
        name: pod.metadata!.name!,
        namespace: pod.metadata!.namespace!,
        previous: true,
    });

    console.log(logs);

    return logs;
}
