npm install
mkdir -p log
mkdir -p build
cp -r lib/web build/.
cp node_modules/alertifyjs/build/css/alertify.min.css node_modules/alertifyjs/build/css/themes/default.css build/web/css/alertify/.
node node_modules/browserify/bin/cmd.js --debug lib/frontend/main.js -o build/web/frontend.js
