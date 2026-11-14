'use strict';

const { EventEmitter } = require('events');

const bridgeEmitter = new EventEmitter();
bridgeEmitter.setMaxListeners(50);

module.exports = { bridgeEmitter };
