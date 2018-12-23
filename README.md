# login-logout-jwt-nodejs

# Description
This app includes following things:
- user registration (password uses bcrypt) `http://localhost:3000/user/register`
- login through (passport and jwt authentication) `http://localhost:3000/user/login`
- set password (bcrypt and jwt authencation) `http://localhost:3000/user/set-pwd`
- view profile (jwt authentication) `http://localhost:3000/user/view`
- profile pic upload (jwt authencation) `http://localhost:3000/user/pic-upload`

# Requirements
- MongoDB (3*)
- Redis
- NodeJS (10*)

# Do following things before running the app
- make a Database (`auth`) in MongoDB
- Setup your config as required (`configs/config.json`)
- run command `npm install` to install all the dependencies
- install nodemon globally if you want to run your app on `watch` (`npm install -g nodemon`)

