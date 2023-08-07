require('dotenv').config()
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_CLIENT_SECRET);
const admin = require('firebase-admin');
const serviceAccount = require("./serviceDetails.json")

const app = express();
const PORT = 8080;

app.use("/stripe", express.raw({type: "*/*"}))
app.use(express.json());
app.use(cors());

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore().collection('game');
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

app.get('/check', async function (req,res) {
    await db.where('active', '==', 1).get().then(async(query)=> {
        const data = query.docs[0].data();
        let tod = new Date();
        let startMinute = data.id.slice(-2);
        let startSecond = data.startSecond;
        let nowtime = new Date();
        let diff = (parseInt(nowtime.getMinutes()*60 + parseInt(nowtime.getSeconds()))) - (parseInt(startMinute)*60 + parseInt(startSecond) ) ;
        
        let result = {
            id: data.id,
            startSecond: data.startSecond,
            diff: diff
        }
        res.json(result);
    }).catch(err => {
        res.status(502).json({error: err.message})
    })
    
})

var minute = 3, interval = minute*60*1000;

setInterval(async function() {
    var todays = new Date();
    var date = todays.getDate();
    var year = todays.getFullYear();
    var month = todays.getMonth()+1;
    var hour = todays.getHours();
    var minute = todays.getMinutes();
    if (month<10){
        month=`0${month.toString()}`;
    } else {
        month = month.toString();
    }

    if(date<10){
        date = `0${date.toString()}`;
    } else {
        date = date.toString();
    }

    if(hour<10){
        hour = `0${hour.toString()}`;
    } else {
        hour = hour.toString();
    }

    if(minute<10){
        minute = `0${minute.toString()}`;
    } else {
        minute = minute.toString();
    }
    year = year.toString();
    var id = year+month+date+hour+minute;
    console.log(id);
    let arr = [];
    for(let i=0; i<10;i++) {
        let temp = {};
        temp[i] = 0;
        arr.push(temp);
    }

    let winNumber = 0;
    let investData = [];
    let win = '';
    await db.where('active', '==', 1).get().then(async (query) => {
        const docs = query.docs;
        if(docs.length > 0) {
            let dt = docs[0].data();
            console.log(dt)
            let red = dt.red;
            investData = dt.investData;
            let green = dt.green;
            if(red > green) {
                win = 'green';
            } else if(green > red) {
                win = 'red';
            } else {
                let choose = Math.floor(Math.random() * 2) + 1
                if(choose === 1){
                    win ='red violet'
                } else {
                    win = 'green violet'
                }
            }
            let green_numbers = [1,3,7,9];
            let red_numbers = [2,4,6,8];
            let violet_numbers = [0,5];
            if (win === 'green'){
                winNumber = green_numbers[Math.floor(Math.random()*green_numbers.length)];
            } else if (win === 'red'){
                winNumber = red_numbers[Math.floor(Math.random()*red_numbers.length)];
            } else if (win.includes('violet')){
                winNumber = violet_numbers[Math.floor(Math.random()*violet_numbers.length)];
            }
            let price = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000
            docs[0].ref.update({
                active: 0,
                win: win,
                price: price.toString()+winNumber.toString()
            })
        }
    })
    let uploadData = {
        id: id,
        amount: 0,
        investData: [],
        red: 0,
        green: 0,
        violet: 0,
        numberData: '',
        win: '',
        active: 1,
        startSecond: todays.getSeconds()
    };
    // console.log(uploadData)
    await db.add(uploadData);
    for(let j = 0;j < investData.length;j++){
        let reward = 0;
        let personalData = investData[j];
        if(winNumber === personalData.number){
            reward = reward + personalData.amount*7;
        }
        if(personalData.color === 'Green' && win.includes('green')){
            reward = reward + personalData.amount*1.8;
        }
        if(personalData.color === 'Red' && win.includes('red')){
            reward = reward + personalData.amount*1.8;
        }
        if(personalData.color === 'Violet' && win.includes('violet')){
            reward = reward + personalData.amount*3.5
        }
        const options = {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true,
          };
        let nowD = new Date().toLocaleString('en-IN', options).replace(',', '');
        // var tt = `${nowD.getFullYear()}/${nowD.getMonth()+1}/${nowD.getDate()} ${nowD.getHours()}:${nowD.getMinutes()}:${nowD.getSeconds()}`
        await userDb.where('phone', '==', personalData.phone).get().then(async(query)=> {
            await query.docs[0].ref.update({
                balance: query.docs[0].data().balance + reward
            })
            await transactionDb.add({
                id: query.docs[0].id,
                phone: query.docs[0].data().phone,
                amount: reward,
                time: nowD,
                message: 'Success, Credited for Game'
            })
        })


    }

}, interval);

app.listen(PORT, ()=> console.log('Server running on port 8080'))