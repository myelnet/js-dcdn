import * as React from 'react';
import {render} from 'react-dom';

import {register} from './registerService';

import Root from './Root';

const rootElement = document.getElementById('root');
render(<Root />, rootElement);

register();
