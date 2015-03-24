#!/bin/bash

kill -2 `ps -ef | grep 'node exchange' | grep -v grep | sed 's/  */ /g' | cut -d' ' -f3`
node exchange config.json &
