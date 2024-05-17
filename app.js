import express from "express";
import user from "./models/user.js";
import { userSort } from './public/javascripts/functions.js';
import passport from "passport";
import localStrategy from "passport-local";
import expressSession from "express-session";
import flash from "connect-flash";
import { Server } from "socket.io";
import { createServer } from "node:http";
import globalChat from "./models/global.js";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});
const PORT = 3000;
let onlineUsers = [];

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());
app.use(flash());


////////////////////////////////////////////////////////////
passport.use(new localStrategy(user.authenticate()));
app.use(
  expressSession({
    resave: false,
    saveUninitialized: false,
    secret: "hey"
  })
);

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

////////////////////////////////////////////////////////////
app.get("/", (req, res) => {
  res.render("start.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs", { existsError: req.flash("error") });
});

app.post("/register", (req, res, next) => {
  const userData = new user({
    username: req.body.username,
    password: req.body.password,
    fullname: req.body.fullname,
  });
  console.log(req.body);
  user.register(userData, req.body.password, (err) => {
    if (err) {
      // If the error is due to a duplicate username
      if (err.name === "UserExistsError") {
        req.flash("error", "Username already exists.");
        return res.redirect("/register");
      }
    }
    // Registration successful
    passport.authenticate("local")(req, res, () => {
      res.redirect("/home");
    });
  });
});

app.get("/login", (req, res) => {
  res.render("login.ejs", { error: req.flash("error") });
});

app.post("/login", passport.authenticate("local", {
  successRedirect: "/home",
  failureRedirect: "/login",
  failureFlash: true,
}));

app.get("/logout", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  res.redirect("/logout/" + username);
});

app.get("/logout/:username", isLoggedIn, (req, res, next) => {

  req.logout((err) => {
    if (err) {
      return next(err);
    }
    onlineUsers.splice(onlineUsers.indexOf(req.params.username), 1);
    res.redirect("/login");
  });
});

/**************************************************************************************************************************************/
app.get("/profile", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  res.redirect("/profile/" + username);
});

app.get("/profile/:username", isLoggedIn, (req, res) => {
  if (req.params.username !== req.session.passport.user) {
    res.redirect("/login");
  } else {
    res.render("profile.ejs");
  }
});

/**************************************************************************************************************************************/

app.get("/home", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  const searchName = req.query.search;
  let redirectUrl = "/home/" + username;
  if (searchName !== undefined) {
    redirectUrl += "?search=" + searchName;
  }
  res.redirect(redirectUrl);
});

app.get("/home/:username", isLoggedIn, async (req, res) => {
  try {
    const searchQuery = req.query.search;

    if (req.params.username !== req.session.passport.user) {
      res.redirect("/login");
    }
    else {
      //Username of Friends of the client
      let friendsListList = await user.find(
        { username: req.params.username },
        { _id: 0, friends: 1 }
      );
      let friendsList = friendsListList[0].friends;

      //Details of each friend of client
      let friendDetailsList = await user.find(
        { username: { $in: friendsList } },
        { _id: 0, username: 1, fullname: 1 }
      );

      //To filter friendlist according to search
      if (searchQuery !== undefined && searchQuery !== '') {
        friendDetailsList = friendDetailsList.filter(user => user.fullname.includes(searchQuery));
      }

      res.render("home.ejs", {
        friendDetailsList: friendDetailsList
      });
    }
  }
  catch (err) {
    console.log(err);
  }

});

/*************************************************************************************************************************************/

app.get("/group", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  res.redirect("/group/" + username);
});

app.get("/group/:username", isLoggedIn, (req, res) => {
  if (req.params.username !== req.session.passport.user) {
    res.redirect("/login");
  } else {
    res.render("group.ejs");
  }
});

/**************************************************************************************************************************************/

app.get("/addUser", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  const searchName = req.query.search;
  let redirectUrl = "/addUser/" + username;
  if (searchName !== undefined) {
    redirectUrl += "?search=" + searchName;
  }
  res.redirect(redirectUrl);
});

app.get("/addUser/:username", isLoggedIn, async (req, res) => {
  try {
    const searchQuery = req.query.search;

    if (req.params.username !== req.session.passport.user) {
      return res.redirect("/login");
    }
    else {
      //All existing users details except the client
      let existingUserList = await user.find(
        { username: { $ne: req.params.username } },
        { _id: 0, username: 1, fullname: 1 }
      );

      //Usernames of Friends of the client
      let friendsList = await user.find(
        { username: req.params.username },
        { _id: 0, friends: 1 }
      );

      let sortedUserList = userSort(friendsList, existingUserList);

      //To filter sorted Users according to search
      if (searchQuery !== undefined && searchQuery !== '') {
        sortedUserList = sortedUserList.filter(user => user.username.includes(searchQuery));
      }

      res.render("addUser.ejs", {
        existingUsers: sortedUserList,
        friendsList: friendsList
      });
    }
  }
  catch (err) {
    console.log(err);
  }
});

app.post("/addFriend/:newFriendName", isLoggedIn, async (req, res) => {
  try {
    const myUsername = req.session.passport.user;
    const frdUsername = req.params.newFriendName;
    await user.updateOne(
      { username: myUsername },
      { $push: { friends: frdUsername } }
    );
    res.redirect("/addUser");
  }
  catch (err) {
    console.log(err);
  }
});

app.post("/removeFriend/:oldFriendName", isLoggedIn, async (req, res) => {
  try {
    const myUsername = req.session.passport.user;
    const frdUsername = req.params.oldFriendName;
    await user.updateOne(
      { username: myUsername },
      { $pull: { friends: frdUsername } }
    );
    res.redirect("/addUser");
  }
  catch (err) {
    console.log(err);
  }
});

/****************************************************************************************************************************************/

app.get("/global", isLoggedIn, (req, res) => {
  const username = req.session.passport.user;
  res.redirect("/global/" + username);
});

app.get("/global/:username", isLoggedIn, async (req, res) => {
  try {
    if (req.params.username !== req.session.passport.user) {
      res.redirect("/login");
    }
    else {
      //All online users details
      let onlineUsersList = await user.find(
        { username: { $in: onlineUsers } },
        { _id: 0, username: 1, fullname: 1 }
      );

      res.render("global.ejs", {
        online: onlineUsers.length,
        onlineUsersList: onlineUsersList,
        username: req.session.passport.user
      });
    }
  }
  catch (err) {
    console.log(err);
  }

});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    if (!onlineUsers.includes(req.session.passport.user)) {
      onlineUsers.push(req.session.passport.user);
    }
    return next();
  }
  res.redirect("/login");
}

//////////////////////////////////socket io code//////////////////////////////////////////

io.on("connection", (socket) => {
  console.log("Online :" + onlineUsers);

  socket.on("disconnect", () => {
    // socket.leave("some room");
    console.log("Online :" + onlineUsers);
  });
});

/**************************************************  Global Chat  **********************************************************************************/
io.on('connection',async (socket) => {
  socket.on('Global Chat', async (msg, username) => {
    let savedMessage;
    try {
      const globalchat = new globalChat({
        username: username,
        text: msg
      });
      await globalchat.save();

    } catch (err) {
      console.error('Error saving message to database:', err);
    }
    socket.broadcast.emit('Global Chat', msg, username);
  });

  if (!socket.recovered) {
    // If the connection state recovery was not successful
    try {
      // Fetch messages from MongoDB that were created after the serverOffset timestamp
      const messages = await globalChat.find({ timestamp: { $gt: 0 } });

      // Emit each message to the client
      messages.forEach(message => {
        socket.emit('Recover messages', message.text,message.username , message._id);
      });
    } catch (e) {
      console.error('Error fetching messages from database:', e);
    }
  }
});

//////////////////////////////////////////////

// io.on("connection", (socket) => {
//   // socket.join("some room");

//   socket.on("chat message", (msg) => {
//     // Broadcast to all connected clients in the room except the sender
//     socket.to("some room").emit("chat message", msg);

//   });
//   // Join the room named 'some room'
// });

//////////////////////////////////////////////////////////

server.listen(PORT, () => {
  console.log(`Listening to port ${PORT}`);
});

