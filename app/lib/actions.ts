'use server';

import { GetPodLogs } from './k8s';

// Server Action: fetch the logs of the currently running instance of a pod.
// Pass `container` to select a specific container in a multi-container pod.
export async function fetchPodLogs(
    namespace: string,
    name: string,
    container?: string
): Promise<string> {
    return GetPodLogs(namespace, name, { container, tailLines: 1000 });
}
