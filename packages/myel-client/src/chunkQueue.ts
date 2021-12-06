interface AsyncResolver<T> {
  resolve: (res: IteratorResult<T>) => void;
  reject: (err: Error) => void;
}

export function msgQueue<T>() {
  const pullQueue: Array<AsyncResolver<T>> = [];
  const pushQueue: Array<Promise<IteratorResult<T>>> = [];
  let isStopped = false;
  return {
    push(value: T): void {
      if (isStopped) return;

      const resolution = {value, done: false};
      if (pullQueue.length) {
        const pending = pullQueue.shift();
        if (pending) {
          pending.resolve(resolution);
        }
      } else {
        pushQueue.push(Promise.resolve(resolution));
      }
    },
    stop(): void {
      if (isStopped) return;
      isStopped = true;

      for (const pending of pullQueue) {
        pending.resolve({value: undefined, done: true});
      }

      pullQueue.length = 0;
    },
    fail(error: any): void {
      if (isStopped) return;
      isStopped = true;

      if (pullQueue.length) {
        for (const pending of pullQueue) {
          pending.reject(error);
        }

        pullQueue.length = 0;
      } else {
        const rejection = Promise.reject(error);

        /* Attach error handler to avoid leaking an unhandled promise rejection. */
        rejection.catch(() => {});
        pushQueue.push(rejection);
      }
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next: () => {
          const result = pushQueue.shift();
          if (result) {
            return result;
          } else if (isStopped) {
            return Promise.resolve({value: undefined, done: true});
          } else {
            return new Promise((resolve, reject) => {
              pullQueue.push({resolve, reject});
            });
          }
        },
        return: () => {
          isStopped = true;
          pushQueue.length = 0;
          return Promise.resolve({value: undefined, done: true});
        },
      };
    },
  };
}
