import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {FsPortal} from '@dcdn/fs-portal';
import '@dcdn/fs-portal/styles.css';
import '@reach/dialog/styles.css';
import swfile from 'url:@dcdn/service-worker/dist/index.min.js';

const WORKER_URL = 'https://client.myel.workers.dev/';

const app = document.getElementById('app');
ReactDOM.render(<FsPortal swUrl={swfile} cfwUrl={WORKER_URL} />, app);
