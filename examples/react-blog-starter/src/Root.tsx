import * as React from 'react';
import {Suspense} from 'react';
import {ErrorBoundary} from 'react-error-boundary';
import {HashRouter as Router} from 'react-router-dom';

import App from './App';

type ErrorProps = {
  error: Error;
};

function ErrorComponent({error}: ErrorProps) {
  return (
    <div>
      <h1>Application Error</h1>
      <pre style={{whiteSpace: 'pre-wrap'}}>{error.stack}</pre>
    </div>
  );
}

export default function Root() {
  return (
    <Suspense fallback={null}>
      <ErrorBoundary FallbackComponent={ErrorComponent}>
        <Router>
          <App />
        </Router>
      </ErrorBoundary>
    </Suspense>
  );
}
