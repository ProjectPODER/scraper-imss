const { getCategories, getContracts, saveEntities, getContractDetails } = require('./lib/scraper');
const commandLineArgs = require('command-line-args');
const puppeteer = require("puppeteer");

const optionDefinitions = [
    { name: 'contract', alias: 'c', type: String }
];
const args = commandLineArgs(optionDefinitions);

if(!args.contract) {
    console.log('ERROR: you must specify a contract ID.');
    process.exit(1);
}

let contract = {
    url: '/?P=imsscomprofich&f=' + args.contract
}

async function run() {
    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        let result = await getContractDetails(page, contract);
        console.log(result)
    }
    catch (err) {
        console.log(err);
    }
    await browser.close();
}

run();
