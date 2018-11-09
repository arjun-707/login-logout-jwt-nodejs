# Gremlin Configuration Folder

[![N|Solid](https://www.rankwatch.com/templates/applications/default/versions/mach4/themes/default/images-home1/rank_logo.png?catched_main)](https://www.rankwatch.com)

Gremlin consist of maily two parts
    - api
    - workers

## api

This folder consist of configurations for api, Whenver you add a new module you need to update a config  (JSON) file for the same. And update a config.json File.  Importnat you can nate change the name of config.json its used

in config.sample.json you might see a section in application with name another_app. In that you need to provide the name of config file of your module, loglevel you want to maintain and lofile for the same.

## workers

In workers section you need to provide a config for your workers if you have one.