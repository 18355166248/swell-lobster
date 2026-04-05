type LoadingListener = () => void;

let activeRequestCount = 0;
const listeners = new Set<LoadingListener>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeGlobalLoading(listener: LoadingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGlobalLoadingSnapshot(): boolean {
  return activeRequestCount > 0;
}

export function beginGlobalLoading(): () => void {
  activeRequestCount += 1;
  emitChange();

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    activeRequestCount = Math.max(0, activeRequestCount - 1);
    emitChange();
  };
}

export async function trackGlobalLoading<T>(promise: Promise<T>): Promise<T> {
  const done = beginGlobalLoading();
  try {
    return await promise;
  } finally {
    done();
  }
}
