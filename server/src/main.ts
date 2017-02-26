/// <reference path="../node_modules/node-hot/dist/index.d.ts" />

import 'source-map-support/register';
if (process.env.NODE_ENV === 'development') {
    require('node-hot');
}
import './server';
