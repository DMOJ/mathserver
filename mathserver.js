#!/usr/bin/env node

var mjAPI = require('MathJax-node/lib/mj-single.js');
var url = require('url');
var unescape = require('querystring').unescape;

var argv = require('yargs')
  .demand(1).strict()
  .usage('Usage: mathserver [options] <port>', {
    host: {
      default: '127.0.0.1',
      describe: 'address to listen on'
    },
    font: {
      default: 'TeX',
      describe: 'web font to use'
    },
    inline_path: {
      default: '/math',
      describe: 'web font to use'
    },
    display_path: {
      default: '/display_math',
      describe: 'web font to use'
    },
  })
  .argv;

mjAPI.config({MathJax: {SVG: {font: argv.font === 'STIX' ? 'STIX-Web' : argv.font}}});
mjAPI.start();

var urlmap = {};
urlmap[argv.inline_path] = {
  format: 'inline-TeX',
};
urlmap[argv.display_path] = {
  format: 'TeX',
};

require('http').createServer(function (req, res) {
  var params = url.parse(req.url);
  if (!(params.pathname in urlmap)) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('404 Not Found');
    return;
  }
  var config = urlmap[params.pathname];
  var math = unescape(params.query);
  mjAPI.typeset({
    math: math,
    format: config.format,
    svg: true,
  }, function (data) {
    if (data.errors) {
      res.writeHead(400, {'Content-Type': 'text/plain'});
      res.end(data.errors);
    } else {
      res.writeHead(200, {'Content-Type': 'image/svg+xml; charset=utf-8'});
      res.end(data.svg);
    }
  });
}).listen(parseInt(argv._[0]), argv.host);
