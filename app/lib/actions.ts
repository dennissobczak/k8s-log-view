'use server';

import { GetPodLogs, GetPodEvents, type EventInfo } from './k8s';

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

// Server Action: fetch the events for a pod (kubectl events for pod/<name>).
export async function fetchPodEvents(
    namespace: string,
    name: string
): Promise<EventInfo[]> {
    return GetPodEvents(namespace, name);
}
