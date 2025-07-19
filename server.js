const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 TimelockVault UI server running at http://localhost:${PORT}`);
    console.log(`📋 Make sure your local blockchain is running on http://127.0.0.1:8545`);
    console.log(`🔗 Connect your wallet and load your deployed contract address`);
}); 