#declare -a Years=("1990" "1991" "1992" "1993" "1994" "1995" "1996" "1997" "1998" "1999" "2000" "2001" "2002" "2003" "2004" "2005" "2006" "2007" "2008" "2009" "2010" "2011" "2012" "2013" "2014" "2015" "2016" "2017" "2018" "2019" "2020")
declare -a Years
for y in "$@"
do
    Years[i]=$y;
    i=$((i + 1));
done
echo "Years to process: ${Years[@]}"

SCRIPT_PATH_REMOTE=/home/nodejs/scrapper-imss
SCRIPT_PATH_LOCAL=`pwd`/*
SCRIPT_LABEL=imscrap
SCRIPT_DEPENDENCIES="ca-certificates fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils"
DROPLET_REGION=sfo2
DROPLET_SIZE=s-1vcpu-2gb
DROPLET_IMAGE=nodejs-20-04

for YEAR in ${Years[@]}; do
    echo "Creating ${SCRIPT_LABEL}${YEAR} droplet ..."
    RESPONSE=`doctl compute droplet create --region ${DROPLET_REGION} --size ${DROPLET_SIZE} --image ${DROPLET_IMAGE} --tag-name ${SCRIPT_LABEL} --wait --format PublicIPv4 --ssh-keys="63:83:0f:42:1f:27:6a:e7:06:64:b2:85:53:a9:4d:f8,dc:76:91:e4:bc:65:54:ca:54:e1:34:b4:a0:16:92:4d" ${SCRIPT_LABEL}${YEAR}`
    IP="${RESPONSE/Public IPv4$'\n'/}"
    sleep 25

    echo "Configuring ${IP} ..."
    ssh  -o "StrictHostKeyChecking no" root@${IP} "cp -r /root/.ssh /home/nodejs && chown -R nodejs:nodejs /home/nodejs"
    ssh root@${IP} "apt update && apt install -y ${SCRIPT_DEPENDENCIES}"

    echo "Copying script to ${IP} ..."
    ssh  nodejs@${IP} mkdir $SCRIPT_PATH_REMOTE
    scp -rC $SCRIPT_PATH_LOCAL nodejs@${IP}:$SCRIPT_PATH_REMOTE
    ssh nodejs@${IP} "cd $SCRIPT_PATH_REMOTE && npm install"

    echo "Launching ${YEAR} in ${IP} ..."
    ssh nodejs@${IP} "cd $SCRIPT_PATH_REMOTE && screen -d -m -S ${SCRIPT_LABEL} node ${SCRIPT_PATH_REMOTE}/index.js -v -o file -y ${YEAR}"

    echo "Remote screens list in ${IP}"
    ssh nodejs@${IP} screen -ls
done;

doctl compute droplet list --tag-name imscrap --format Name,PublicIPv4
