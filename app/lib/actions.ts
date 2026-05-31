'use server';

import { GetPodLogs } from './k8s';

// Server Action: fetch the logs of the currently running instance of a pod.
export async function fetchPodLogs(
    namespace: string,
    name: string
): Promise<string> {
    return GetPodLogs(namespace, name, { tailLines: 1000 });
}
