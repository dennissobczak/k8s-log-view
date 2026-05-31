//'use server';

import * as k8s from '@kubernetes/client-node';

export async function InitK8sClient() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); // reads ~/.kube/config or $KUBECONFIG
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

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
}

export async function ListPods(): Promise<PodInfo[]> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); // reads ~/.kube/config or $KUBECONFIG
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    const pods = await k8sApi.listPodForAllNamespaces();

    return pods.items.map((pod) => {
        const containers = pod.status?.containerStatuses ?? [];
        const readyCount = containers.filter((c) => c.ready).length;
        const restarts = containers.reduce((sum, c) => sum + (c.restartCount ?? 0), 0);

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
        };
    });
}

export async function GetFirstPodLogs() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); // reads ~/.kube/config or $KUBECONFIG
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

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
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); // reads ~/.kube/config or $KUBECONFIG
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

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
