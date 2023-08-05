require('dotenv').config()
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_CLIENT_SECRET);

const app = express();
const PORT = 8080;

app.use("/stripe", express.raw({type: "*/*"}))
app.use(express.json());
app.use(cors());

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

app.listen(PORT, ()=> console.log('Server running on port 8080'))