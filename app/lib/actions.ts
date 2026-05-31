'use server';

import { GetPodLogs } from './k8s';

// Server Action: fetch a pod's logs.
// Pass `container` to select a specific container in a multi-container pod, and
// `previous` to read the logs of the previously terminated instance (kubectl logs --previous).
export async function fetchPodLogs(
    namespace: string,
    name: string,
    container?: string,
    previous?: boolean
): Promise<string> {
    return GetPodLogs(namespace, name, { container, previous, tailLines: 1000 });
}
