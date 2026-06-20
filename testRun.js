const { JSDOM } = require('jsdom');
const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');

const dom = new JSDOM(indexHtml, { runScripts: "dangerously", url: "http://localhost/" });
dom.window.eval(appJs);
console.log("No execution errors.");
