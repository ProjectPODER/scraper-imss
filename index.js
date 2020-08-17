const { getCategories, getContracts, saveEntities, getContractDetails } = require('./lib/scraper');
const commandLineArgs = require('command-line-args');

const optionDefinitions = [
    { name: 'years', alias: 'y', type: String, multiple: true },
    { name: 'verbose', alias: 'v', type: Boolean },
    { name: 'startFrom', alias: 's', type: String, multiple: true },
    { name: 'output', alias: 'o', type: String, defaultOption: "stdout" }
];
const args = commandLineArgs(optionDefinitions);

global.verbose = args.verbose;
global.output = args.output;
global.skipCats = false;
global.startCat = null;
global.skipSubcats = false;
global.startSubcat = null;
global.skipRubros = false;
global.startRubro = null;

// If we should skip anything, set starting point
if(args.startFrom) {
    global.skipCats = true;
    global.startCat = args.startFrom[0];
    if(args.startFrom.length >= 2) {
        global.skipSubcats = true;
        global.startSubcat = args.startFrom[1];
    }
    if(args.startFrom.length == 3) {
        global.skipRubros = true;
        global.startRubro = args.startFrom[2];
    }
}

let entities = {
    companies: [],
    persons: [],
    memberships: [],
    contracts: []
}

if(verbose) console.log('Starting...');

getCategories(args.years)
.then( (results) => {
    if(results.hasOwnProperty('status') && results.status == 'ERROR') {
        console.log(results.results);
        process.exit(1);
    }

    return getContracts(results);
} )
.then( (results) => {
    if(results.hasOwnProperty('status') && results.status == 'ERROR') {
        console.log(results.results);
        process.exit(1);
    }

    if(verbose) console.log('Writing documents...');
    saveEntities(results);
    if(verbose) console.log('DONE');
    process.exit();
} );
