/*jshint globalstrict:true, trailing:false, unused:true, node:true */
"use strict";

var express         = require('express');
var passport        = require('passport');
var OAuth2Strategy  = require('passport-oauth2');
var request         = require('request');
var querystring     = require('querystring');

var gitterHost    = process.env.HOST || 'https://gitter.im';
var port          = process.env.PORT || 7000;

// Client OAuth configuration
var clientId      = process.env.GITTER_KEY ? process.env.GITTER_KEY.trim() : undefined;
var clientSecret  = process.env.GITTER_SECRET ? process.env.GITTER_SECRET.trim() : undefined;

// Gitter API client helper
var gitter = {
  fetch: function(path, token, cb) {
    var options = {
     url: gitterHost + path,
     headers: {
       'Authorization': 'Bearer ' + token
     }
    };

    request(options, function (err, res, body) {
      if (err) return cb(err);

      if (res.statusCode === 200) {
        cb(null, JSON.parse(body));
      } else {
        cb('err' + res.statusCode);
      }
    });
  },

  fetchCurrentUser: function(token, cb) {
    this.fetch('/api/v1/user/', token, function(err, user) {
      cb(err, user[0]);
    });
  },

  fetchRooms: function(user, token, cb) {
    this.fetch('/api/v1/user/' + user.id + '/rooms', token, function(err, rooms) {
      cb(err, rooms);
    });
  }
};

var app = express();

// Middlewares
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');
app.use(express.json());
app.use(express.urlencoded());
app.use(express.static( __dirname + '/public'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({secret: 'keyboard cat'}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);

// Passport Configuration

passport.use(new OAuth2Strategy({
    authorizationURL:   gitterHost + '/login/oauth/authorize',
    tokenURL:           gitterHost + '/login/oauth/token',
    clientID:           clientId,
    clientSecret:       clientSecret,
    callbackURL:        '/login/callback',
    passReqToCallback:  true
  },
  function(req, accessToken, refreshToken, profile, done) {
    req.session.token = accessToken;
    gitter.fetchCurrentUser(accessToken, function(err, user) {
      return (err ? done(err) : done(null, user));
    });
  }
));

passport.serializeUser(function(user, done) {
  done(null, JSON.stringify(user));
});

passport.deserializeUser(function (user, done) {
  done(null, JSON.parse(user));
});

app.get('/login',
  passport.authenticate('oauth2')
);

app.get('/login/callback',
  passport.authenticate('oauth2', {
    successRedirect: '/home',
    failureRedirect: '/'
  })
);

app.get('/logout', function(req,res) {
  req.session.destroy();
  res.redirect('/');
});

app.get('/', function(req, res) {
  res.render('landing');
});


app.get('/home', function(req, res) {
  if (!req.user) return res.redirect('/');

  // Fetch user rooms using the Gitter API
  gitter.fetchRooms(req.user, req.session.token, function(err, rooms) {
    if (err) return res.send(500);

    res.render('home', {
      user: req.user,
      token: req.session.token,
      clientId: clientId,
      rooms: rooms
    });
  });

});

app.get('/rooms/:roomId', function(req, res){
  gitter.fetch(`/api/v1/rooms/${req.params.roomId}/chatMessages?${querystring.stringify(req.query)}`, req.session.token, function(err, r) {
    res.send(`
      <table>
       ${r.map(m=>`<tr>
          <td style="width:130px;">${m.sent.substring(0,16).replace('T',' ')}</td>
          <td>${m.fromUser.username}</td>
          <td>${m.html}</td>
        </tr>`).join('')}
      </table>
    `);
  });
});

app.listen(port);
console.log('Demo app running at http://localhost:' + port);
