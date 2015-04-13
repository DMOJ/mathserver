#!/usr/bin/env node

var mjAPI = require('MathJax-node/lib/mj-single.js');
var url = require('url');
var unescape = require('querystring').unescape;
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var argv = require('yargs')
  .demand(1).strict()
  .usage('Usage: mathserver [options] <port>', {
    host: {
      default: '127.0.0.1',
      describe: 'address to listen on'
    },
    no_optimize: {
      boolean: true,
      describe: 'disable optimization of svg'
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
    cache: {
      default: 'cache',
      describe: 'cache directory'
    }
  })
  .argv;

mjAPI.config({MathJax: {SVG: {font: argv.font === 'STIX' ? 'STIX-Web' : argv.font}}});
mjAPI.start();

if (!argv.no_optimize) {
  try {
    var SVGO = require('svgo');
    var svgo = new SVGO();
  } catch (e) {
    var svgo = undefined;
    console.log("Can't find svgo, can't optimize svgs");
  }
} else
  var svgo = undefined;

var cache_dir = argv.cache;
var urlmap = {};
urlmap[argv.inline_path] = {
  format: 'inline-TeX', cache: 'svgi', content_type: 'image/svg+xml; charset=utf-8'
};
urlmap[argv.display_path] = {
  format: 'TeX', cache: 'svgd', content_type: 'image/svg+xml; charset=utf-8'
};

function save(file, data) {
  var temp = file + '.tmp';
  fs.writeFile(temp, data, function (err) {
    if (err) console.log(err);
    fs.rename(temp, file, function (err) {
      if (err) console.log(err);
    });
  });
}

require('http').createServer(function (req, res) {
  var params = url.parse(req.url);
  if (!(params.pathname in urlmap)) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('404 Not Found');
    return;
  }
  var config = urlmap[params.pathname];
  var math = unescape(params.query);
  var hash = crypto.createHash('md5').update(math).digest('hex');
  var cache = path.join(cache_dir, config.cache + '_' + hash);
  fs.exists(cache, function (exists) {
    if (exists) {
      fs.readFile(cache, function (err, data) {
        if (err) {
          console.log(err);
          res.writeHead(500, {'Content-Type': 'text/plain'});
          res.end(err);
        } else {
          res.writeHead(200, {'Content-Type': config.content_type});
          res.end(data);
        }
      });
      return;
    }
    mjAPI.typeset({
      math: math,
      format: config.format,
      svg: true,
    }, function (data) {
      if (data.errors) {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        res.end(data.errors);
      } else {
        if (typeof svgo !== 'undefined') {
          svgo.optimize(data.svg, function (result) {
            res.writeHead(200, {'Content-Type': config.content_type});
            res.end(result.data);
            save(cache, result.data);
          });
        } else {
          res.writeHead(200, {'Content-Type': config.content_type});
          res.end(data.svg);
          save(cache, data.svg);
        }
      }
    });
  });
}).listen(parseInt(argv._[0]), argv.host);
