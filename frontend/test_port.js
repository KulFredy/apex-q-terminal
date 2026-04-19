const express = require('express');
const app = express();
app.get('/', (req,res) => res.send('TEST_SERVER_OK'));
app.listen(3002, () => console.log('ready'));