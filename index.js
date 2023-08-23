require('dotenv').config()
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_CLIENT_SECRET);
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const serviceAccount = require("./serviceDetails.json")

const app = express();
const PORT = 8080;

app.use("/stripe", express.raw({type: "*/*"}))
app.use(bodyParser.json())
app.use(cors());



admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

let currentGameId = null;

const db = admin.firestore().collection('games');
const userDb = admin.firestore().collection('newData');
const transactionDb = admin.firestore().collection('transactions')

app.post('/pay', async (req, res) => {
    try{
        const {phone} = req.body;
        const {amount} = req.body;
        console.log(amount);
        if(!phone) return res.status(400).json({message: 'Please enter phone'})
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount*100),
            currency: 'INR',
            payment_method_types: ["card"],
            metadata: {phone}
        });
        const clientSecret = paymentIntent.client_secret;
        res.json({ message: 'Payment Initiated', clientSecret })
    } catch(err){
        console.error(err);
        res.status(500).json({message: 'Internal Server Error'})
    }
})

app.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try{
        event = await stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    } catch(err){
        console.error(err);
        res.status(500).json({message: err.message});
    }
    console.log(event);
    if(event.type === 'payment_intent.created') {
        console.log(`${event.data.object.metadata.phone} initiated payment!`)
    }
    if(event.type === 'payment_intent.succeeded') {
        console.log(`${event.data.object.metadata.phone} succeeded payment!`)
    }

    res.json({ok: true})
})

const firestore = admin.firestore()

const startGame = async () => {
    try {
      const gameSnapshot = await firestore.collection('games').orderBy('gameId', 'desc').limit(1).get();
      let newGameId = 1;
  
      if (!gameSnapshot.empty) {
        const lastGame = gameSnapshot.docs[0];
        newGameId = lastGame.data().gameId + 1;
      }
  
      await firestore.collection('games').doc(newGameId.toString()).set({
        gameId: newGameId,
        startTime: admin.firestore.FieldValue.serverTimestamp(),
      });
  
      currentGameId = newGameId.toString();
      console.log(`Game started with ID: ${currentGameId}`);
    } catch (error) {
      console.error('Error starting a new game:', error);
    }
};

const endGame = async () => {
    try {
      if (currentGameId) {
        let winColor = '';
        const randomNumber = Math.floor(Math.random() * 4)
        let colors = ['Red', 'Green', 'Violet Red', 'Violet Green'];
        let green_num = [1,3,7,9]
        let red_num = [2,4,6,8]
        let winNumber = 0
        if (randomNumber === 0){
            winNumber=red_num[Math.floor(Math.random()*4)]
        } else if (randomNumber === 1){
            winNumber = green_num[Math.floor(Math.random()*4)]
        } else if(randomNumber === 2){
            winNumber = 0
        } else if(randomNumber === 3){
            winNumber = 5
        }
        const randomTwoDigitNumber = Math.floor(Math.random() * 90) + 10;
        await firestore.collection('games').doc(currentGameId).update({
          endTime: admin.firestore.FieldValue.serverTimestamp(),
          winColor: colors[randomNumber],
          winNumber: winNumber,
          price: '135'+randomTwoDigitNumber.toString()+winNumber.toString()
        });
        console.log(`Game ended with ID: ${currentGameId}`);
        userData = {};
        userPhones = [];
        await firestore.collection('bets').where('gameId', '==', currentGameId.toString()).get().then(async (query)=> {
            const docs = query.docs;
            console.log(docs.length);
            for(let i=0; i<docs.length; i++) {
              var docRef = docs[i].ref;
              var data = docs[i].data();
              let winAmt = 0;
              if(data.betColor !== undefined) {
                  if(colors[randomNumber].includes(data.betColor)){
                    if(data.betColor === 'Green'){
                      if(colors[randomNumber].includes('Violet')){
                        winAmt = parseFloat(data.amount)*0.9
                      } else {
                        winAmt = parseFloat(data.amount)*1.8;
                      }
                    } else if(data.betColor === 'Red'){
                      if(colors[randomNumber].includes('Violet')){
                        winAmt = parseFloat(data.amount)*0.9
                      } else {
                        winAmt = parseFloat(data.amount)*1.8;
                      }
                    } else if (data.betColor === 'Violet'){
                        winAmt = parseFloat(data.amount)*3.5;
                    }
                  }
                  userData[data.phone] = winAmt;
                  userPhones.push(data.phone);
                  docRef.update({
                  result: colors[randomNumber],
                  resultAmount: winAmt,
                  status: winAmt === 0 ? 'Fail': 'Success'
                  })
              } else if(data.betNumber !== undefined) {
                if(winNumber === parseInt(data.betNumber)){
                    winAmt = parseFloat(data.amount)*7;
                }
                userData[data.phone] = winAmt;
                userPhones.push(data.phone);
                docRef.update({
                    result: winNumber,
                    resultAmount: winAmt,
                    status: winAmt === 0 ? 'Fail': 'Success'
                })
              }
              var today = new Date();
              var tt = `${today.getFullYear()}/${today.getMonth()+1}/${today.getDate()} ${today.getHours()}:${today.getMinutes()}:${today.getSeconds()}`
              console.log(tt)
              await firestore.collection('newData').where('phone', '==', data.phone).get().then(async(query)=> {
                const docs = query.docs;
                for(let i = 0; i < docs.length; i++) {
                    const data = docs[i].data();
                    await docs[i].ref.update({
                        balance: data.balance + winAmt
                    })
                    await firestore.collection('transactions').add({
                        id: docs[i].id,
                        phone: data.phone,
                        amount: winAmt,
                        time: tt,
                        message: `Success, Credited for Winning Game - ${data.gameId}`
                    })
                }
              })
            }
        }).catch(error => {
            console.log(error.message);
        })


        currentGameId = null;
      } else {
        console.log('No active game to end.');
      }
    } catch (error) {
      console.error('Error ending the game:', error);
    }
};

cron.schedule('*/3 * * * *', async() => {
  await endGame();
  await startGame();
});

app.get('/currentGame', async (req, res) => {
    try {
      if (currentGameId) {
        // Calculate the remaining time for the current game
        const currentGameSnapshot = await firestore.collection('games').doc(currentGameId).get();
        const currentGameData = currentGameSnapshot.data();
        const startTime = currentGameData.startTime.toDate().getTime();
        const currentTime = Date.now();
        const remainingTimeInSeconds = Math.floor((startTime + 180000 - currentTime) / 1000);
  
        res.status(200).json({ gameId: currentGameId, remainingTime: remainingTimeInSeconds });
      } else {
        // If there is no active game, start a new one
        startGame();
        res.status(200).json({ gameId: currentGameId, remainingTime: 180 });
      }
    } catch (error) {
      console.error('Error fetching game data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/previousGames', async (req, res) => {
    try {
      const previousGamesSnapshot = await firestore.collection('games').where('endTime', '!=', null).get();
      const previousGames = previousGamesSnapshot.docs.map((doc) => doc.data());
  
      res.status(200).json(previousGames);
    } catch (error) {
      console.error('Error fetching previous games:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/currentVersion', async (req, res) => {
  const obj = {
    version: '2.0.0'
  }
  res.status(200).json(obj);
})

app.listen(PORT, ()=> console.log('Server running on port 8080'))