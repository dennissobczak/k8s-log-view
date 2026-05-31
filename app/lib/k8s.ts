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
