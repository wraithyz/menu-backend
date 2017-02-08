const express = require('express');
const http = require('http');
const moment = require('moment');

const app = express();

var errorMenu = {
    "code": 503,
    "status": "Error getting menu data."
};

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

let tayMenu = [];
let tamkMenu = [];
let ttyMenu = [];
let lastMenuFetch = moment();

app.set('port', process.env.PORT || 3000);

function getRestaurantMenu(host, path, juvenes, day) {
  const options = {
    host: host,
    path: path,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  return new Promise((resolve, reject) => {
    let menu = '';
    const req = http.request(options, (res) => {
      res.on('data', (data) => {
        menu += data;
      });
    });
    req.on('close', () => {
      if (menu.length !== 0) {
        try {
          if (juvenes) {
            const fixedjson1 = menu.replace(/"}\);/g, '}');
            const fixedjson3 = fixedjson1.slice(1, 6) + fixedjson1.slice(7);
            const finalData = fixedjson3.replace(/\\/g, '');
            juvenesParse(JSON.parse(finalData), day)
            .then((data) => {
              resolve(data);
            })
            .catch((err) => {
              console.log(err);
            })
          } else {
            resolve(JSON.parse(menu));
          }
        }
        catch(e) {
          resolve();
        }
      } else {
        resolve();
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

function juvenesParse(data, day) {
  return new Promise((resolve, reject) => {
    const key = days[day];
    let menu = {};
    menu[key] = [];
    for (let category of data.d.MealOptions) {
      let courses = [];
      for (let food of category.MenuItems) {
        if (food.Name.length === 0) continue;
        courses.push({
          name:  food.Name,
          diets: food.Diets,
        });
      }
      menu[key].push({
        category: category.Name,
        courses: courses,
      });
    }
    resolve(menu);
  });
}

function parseAmica(host, path, restaurantName) {
  return new Promise((resolve, reject) => {
    getRestaurantMenu(host, path)
      .then((data) => {
        let menu = {};
        let i = 0;
        for (let menus of data.LunchMenus) {
          if (menus.SetMenus.length === 0) continue;
          const key = days[i];
          menu[key] = [];
          for (let category of menus.SetMenus) {
            let courses = [];
            for (let food of category.Meals) {
              const diets = food.Diets.join();
              courses.push({
                name: food.Name,
                diets: diets,
              });
            }
            if (courses.length === 0) continue;
            let foodCategory = "";
            let foodPrice = "";
            if (category.Name.indexOf(',') !== -1) {
              foodCategory = category.Name.substring(0, category.Name.indexOf(',') - 2);
              foodPrice = category.Name.substring(category.Name.indexOf(',') - 1);
            } else {
              foodCategory = category.Name;
            }
            menu[key].push({
              category: foodCategory,
              price: foodPrice,
              courses: courses,
            })
          }
          i++;
        }
        resolve({
          restaurant: restaurantName,
          menu: menu
        });
      })
      .catch((err) => {
        console.log(err);
      });
  });
}

function parseSodexo(host, path, restaurantName) {
  return new Promise((resolve, reject) => {
    getRestaurantMenu(host, path)
      .then((data) => {
        let menu = {};
        for (let key of Object.keys(data.menus)) {
          const daysMenu = data.menus[key];
          menu[key] = [];
          for (let today of daysMenu) {
            let courses = [];
            courses.push({
              name: today.title_fi,
              diets: today.properties,
            })
            menu[key  ].push({
              price: today.price,
              courses: courses,
            });
          }
        }
        resolve({
          restaurant: restaurantName,
          menu: menu
        });
      })
      .catch((err) => {
        console.log(err);
      });
  });
}

function parseJuvenes(host, path, restaurantName) {
  return new Promise((resolve, reject) => {
    const now = moment();
    let promises = [];
    let uniMenu = [];
    for (let i = 1; i <= days.length; i++) {
      promises.push(getRestaurantMenu(host, `${path}Week=${now.isoWeek()}&Weekday=${i}&lang=%27fi%27&format=json`, true, i-1));
    }
    Promise.all(promises)
      .then((data) => {
        console.log('all done');
        let menu = {};
        for (let day of data) {
          if (day) {
            const key = Object.keys(day);
            if (day[key].length !== 0) {
              menu[key] = day[key];
            }
          }
        }
        resolve({
          restaurant: restaurantName,
          menu: menu
        });
      })
      .catch((err) => {
        console.log(err);
      })
  });
}

app.get("/api/tay", function(req, res) {
  const now = moment();
  if (tayMenu.length !== 0 && now.isSame(lastMenuFetch, 'd')) {
      console.log('cache');
      res.json(JSON.stringify(tayMenu));
  } else {
    console.log('new');
    lastMenuFetch = moment();
    tayMenu = [];
    // 3 = fusion
    // 5 = vegebar
    // 52 = staff
    // 60 = normaali
    let firstDayofWeek = moment();
    firstDayofWeek.startOf('isoweek');
    let date = now.date();
    if (now.day() === 0) {
      date = firstDayofWeek.date();
    }
    const tayAmica = parseAmica('www.amica.fi', `/api/restaurant/menu/week?language=fi&restaurantPageId=7381&weekDate=${now.year()}-${now.month() + 1}-${now.date()}`, 'Amica Minerva (Pinni B)');
    const taySodexo = parseSodexo('www.sodexo.fi', `/ruokalistat/output/weekly_json/92/${now.year()}/${now.month() + 1}/${date}/fi`, 'Sodexo Linna');
    const tayJuvenes = parseJuvenes('www.juvenes.fi', '/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=13&MenuTypeId=60&', 'Juvenes ravintola (Päätalo)');
    const tayJuvenesVege = parseJuvenes('www.juvenes.fi', `/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=13&MenuTypeId=5&`, 'Juvenes Vegebar');
    const tayJuvenesFusion = parseJuvenes('www.juvenes.fi', `/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=13&MenuTypeId=3&`, 'Juvenes Fusion Kitchen');
    Promise.all([tayAmica, taySodexo, tayJuvenes, tayJuvenesVege, tayJuvenesFusion])
      .then((data) => {
        if (data) {
          for (let i = 0; i < data.length; i++) {
            tayMenu.push(data[i]);
          }
          res.json(JSON.stringify(tayMenu));
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }
});

app.get("/api/tty", function(req, res) {
  const now = moment();
  if (ttyMenu.length !== 0 && now.isSame(lastMenuFetch, 'd')) {
      console.log('cache');
      res.json(JSON.stringify(ttyMenu));
  } else {
    console.log('new');
    lastMenuFetch = moment();
    ttyMenu = [];
    let firstDayofWeek = moment();
    firstDayofWeek.startOf('isoweek');
    let date = now.date();
    if (now.day() === 0) {
      date = firstDayofWeek.date();
    }
    // 3 = fusion
    // 5 = vegebar
    // 52 = staff
    // 60 = normaali
    // 77 = såås bar
    const ttyAmica = parseAmica('www.amica.fi', `/api/restaurant/menu/week?language=fi&restaurantPageId=69171&weekDate=${now.year()}-${now.month() + 1}-${now.date()}`, 'Amica Reaktori (Kampusareena)');
    const ttySodexo = parseSodexo('www.sodexo.fi', `/ruokalistat/output/weekly_json/12812/${now.year()}/${now.month() + 1}/${date}/fi`, 'Sodexo Hertsi (Tietotalo)');
    const ttyJuvenes = parseJuvenes('www.juvenes.fi', '/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=6&MenuTypeId=60&', 'Juvenes Newton (Konetalo)');
    const ttyJuvenesBar = parseJuvenes('www.juvenes.fi', `/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=60038&MenuTypeId=77&`, 'Café Konehuone - SÅÅS BAR');
    const ttyJuvenesFusion = parseJuvenes('www.juvenes.fi', `/DesktopModules/Talents.LunchMenu/LunchMenuServices.asmx/GetMenuByWeekday?KitchenId=60038&MenuTypeId=3&`, 'Café Konehuone - Fusion Kitchen');
    Promise.all([ttyAmica, ttySodexo, ttyJuvenes, ttyJuvenesBar, ttyJuvenesFusion])
    .then((data) => {
      if (data) {
        for (let i = 0; i < data.length; i++) {
          ttyMenu.push(data[i]);
        }
        res.json(JSON.stringify(ttyMenu));
      }
    })
    .catch((err) => {
      console.log(err);
    });
  }
});

var server = app.listen(app.get('port'), function() {
    var port = server.address().port;
    console.log('Magic happens on port ' + port);
});
