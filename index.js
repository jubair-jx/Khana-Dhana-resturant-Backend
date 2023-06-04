const express = require("express");
const app = express();
const cors = require("cors");
const PORT = process.env.PORT || 5000;
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleWare
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bruh Your Bistroo Server  is Running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.udnr6tc.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const menuCollection = client.db("bistro").collection("menu");
    const reviewCollection = client.db("bistro").collection("review");
    const cartCollection = client.db("bistro").collection("cart");

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    //delete cart api
    app.get("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    //data post on server
    app.post("/cart", async (req, res) => {
      const body = req.body;
      const result = await cartCollection.insertOne(body);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`You Server is Running on : ${PORT}`);
});
