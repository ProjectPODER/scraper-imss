# scraper-imss

Scraper for [Compras IMSS](http://compras.imss.gob.mx/) website (México).

### Usage

    node index.js [-y YEARS -v -o OUTPUT -s CAT SUBCAT RUBRO]

### Parámetros

    -y --year       List of years to scrape (strings separated by spaces).
    -v --verbose    Show verbose output and debug information
    -o --output     Output mode.
    -s --startFrom  Start scraping from specific category/subcategory/rubro.

##### Specifying a starting point

With the -s command line option it is possible to start scraping from a specific category, subcategory, or rubro (subdivisions of subcategories). This parameter is specified as a sequence of 3 strings, expecting at least one category ID, and also accepting a subcategory and rubro ID (if applicable). Results are appended to that year's output file if it already exists.

### Output

Stream of JSON lines, one contract per line.

##### Output modes

    file    Save contracts in a JSON file inside **output/** directory (YEAR.json).
    stdout  JSON objects, one object per line, representing individiual contracts to stdout.

## Launch Digital Ocean droplets

    ./launch_droplets [YEARS]

Note: delete node_modules before launching droplets to speed up creation time.

To view all running scrapers, use the following command:

    doctl compute droplet list --tag-name imscrap

When the process ends, output shows a list of server IPs. To connect to each server:

    ssh nodejs@[IP]

Scrapers will be running in /home/nodejs/scrapper-imss inside a **screen** process. Once a scraper has finished running and data has been downloaded, droplets should be deleted using the following command:

    doctl compute droplet delete --tag-name imscrap

You may also delete one droplet at a time using --name [NAME] instead of the --tag-name option.
