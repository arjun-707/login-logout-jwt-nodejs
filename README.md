
## Login-logout Using passport and JWT in NodeJS ##

** Description **
This module is a common module for a website. As we all know that a website has: user registration, login, logout, password reset, etc sections.

This app includes following APIs:
- user registration `http://localhost:3000/user/register`: This will require data in POST request
- login `http://localhost:3000/user/login` :  This will require data in POST request and will return a token which you need to attach in header with every request
- set password `http://localhost:3000/user/set-pwd` : This will require a token passed in header and data in post request
- view profile `http://localhost:3000/user/view` : This will require a token passed in header and data in post request
- profile pic upload `http://localhost:3000/user/pic-upload` : This will require a token passed in header and data in post request
- logout and refresh token `http://localhost:3000/user/logout`: A GET method which will store the provided token via header into redis so for the next time when user sends the same token then it will first check into redis and give response accordingly. 

Note : There is a cron which will continously verify the token stored in redis using JWT verify function. Open new tab in your terminal and travel to the directory 'login-logout-jwt-nodejs' and run `nodemon services/token-refresh.js`

# Requirements
- MongoDB (3*)
- Redis
- NodeJS (10*)

# Do following things before running the app
- make a Database (`auth`) in MongoDB
- Setup your config as required (`configs/config.json`)
- run command `npm install` to install all the dependencies
- install nodemon globally if you want to run your app on `watch` (`npm install -g nodemon`)

# For Frontend help see page
login-logout-jwt-nodejs/public/ProfilePhotoDir/test.html
