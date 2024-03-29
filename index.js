const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const PORT = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const jwt = require("jsonwebtoken");

const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  MongoAWSError,
} = require("mongodb");

//middleWare
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bruh Your Bistroo Server  is Running");
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log(authorization);
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    console.log("decoded", decoded);
    next();
  });
};

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
    await client.connect();

    const menuCollection = client.db("bistro").collection("menu");
    const reviewCollection = client.db("bistro").collection("review");
    const cartCollection = client.db("bistro").collection("cart");
    const userCollection = client.db("bistro").collection("user");
    const paymentCollection = client.db("bistro").collection("payment");

    /********
     * 1. use JWT token verify
     * 2. use verify admin middleware
       3. don't show secure link to those who should not see this link 
     *
     */

    //Warning: use Verifytoken Before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1hr",
      });
      // console.log(token);
      res.send({ token });
    });

    //user patch api
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateOne = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateOne);
      res.send(result);
    });

    //user api
    app.post("/user", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const query = { email: user.email };
      const existUser = await userCollection.findOne(query);
      // console.log("exist", existUser);
      if (existUser) {
        return res.send({ message: "User Already exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.post("/menu", verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    });

    app.delete("/menu/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });
    //check admin api
    app.get("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //cart collection api
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      console.log("Cart Mail", email);
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "porviden access" });
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    //delete cart api
    app.delete("/carts/:id", async (req, res) => {
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

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      if (price <= 0) {
        return res.send({});
      }
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", async (req, res) => {
      const body = req.body;
      const result = await paymentCollection.insertOne(body);

      const query = {
        _id: { $in: body.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ result, deleteResult });
    });
    app.get("/admin/stats", async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const order = await paymentCollection.estimatedDocumentCount();

      const payment = await paymentCollection.find().toArray();
      const revenue = payment.reduce((sum, payment) => sum + payment.price, 0);

      res.send({ users, products, order, revenue });
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
