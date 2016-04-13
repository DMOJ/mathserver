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
    inline_svg: {
      default: '/math.svg',
      describe: 'inline math svg path'
    },
    display_svg: {
      default: '/display_math.svg',
      describe: 'display math svg path'
    },
    inline_png: {
      default: '/math.png',
      describe: 'inline math png path'
    },
    display_png: {
      default: '/display_math.png',
      describe: 'display math png path'
    },
    cache: {
      default: 'cache',
      describe: 'cache directory'
    },
    nginx: {
      default: null,
      describe: 'nginx X-Accel-Redirect internal location for cache directory'
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
var x_accel = argv.nginx;
var urlmap = {};
urlmap[argv.inline_svg] = {
  format: 'inline-TeX', cache: 'inline', type: 'svg',
  content_type: 'image/svg+xml; charset=utf-8'
};
urlmap[argv.display_svg] = {
  format: 'TeX', cache: 'display', type: 'svg',
  content_type: 'image/svg+xml; charset=utf-8',
};

try {
  var svg2png = require('svg2png');
  urlmap[argv.inline_png] = {
    format: 'inline-TeX', cache: 'inline', type: 'png',
    content_type: 'image/png'
  };
  urlmap[argv.display_png] = {
    format: 'TeX', cache: 'display', type: 'png',
    content_type: 'image/png',
  };
} catch (e) {
  var svg2png = undefined;
  console.log("Can't rasterize without svg2png")
}

function save(file, data) {
  var temp = file + '.tmp';
  fs.writeFile(temp, data, function (err) {
    if (err) console.log(err);
    fs.rename(temp, file, function (err) {
      if (err) console.log(err);
    });
  });
}

function render_png(data, callback) {
  svg2png(new Buffer(data), {
    width: /width="([\d.]+)ex"/.exec(data)[1] * 9,
    height: /height="([\d.]+)ex"/.exec(data)[1] * 9,
  }).then(callback).catch(e => console.error(e));
}

require('http').createServer(function (req, res) {
  var pathname = url.parse(req.url).pathname;
  var query = req.url.indexOf('?');
  if (!(pathname in urlmap) || query === -1) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('404 Not Found');
    return;
  }
  var config = urlmap[pathname];
  var math = unescape(req.url.substr(query+1));
  var hash = crypto.createHash('md5').update(math).digest('hex');
  var key = config.cache + '_' + hash;
  var prefix = path.join(cache_dir, config.cache + '_' + hash);
  var cache = prefix + '.' + config.type;
  fs.exists(cache, function (exists) {
    if (exists) {
      if (x_accel === null) {
        fs.readFile(cache, function (err, data) {
          if (err) {
            console.log(err);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end(err.toString());
          } else {
            res.writeHead(200, {'Content-Type': config.content_type});
            res.end(data);
          }
        });
      } else {
        res.writeHead(200, {
          'Content-Type': config.content_type,
          'X-Accel-Redirect': x_accel + key + '.' + config.type
        });
        res.end();
      }
      return;
    }
    mjAPI.typeset({
      math: math,
      format: config.format,
      svg: true,
    }, function (data) {
      if (data.errors) {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        res.end(data.errors.toString());
      } else {
        res.writeHead(200, {'Content-Type': config.content_type});
        if (typeof svgo !== 'undefined') {
          svgo.optimize(data.svg, function (result) {
            if (config.type == 'svg')
              res.end(result.data);
            save(prefix + '.svg', result.data);
          });
        } else {
          if (config.type == 'svg')
            res.end(data.svg);
          save(prefix + '.svg', data.svg);
        }
        render_png(data.svg, function (buffer) {
          if (config.type == 'png')
            res.end(buffer);
          save(prefix + '.png', buffer);
        });
      }
    });
  });
}).listen(parseInt(argv._[0]), argv.host);