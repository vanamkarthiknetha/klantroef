const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app, server, mongod;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  ({ app, server } = require('../testServer')); // small boot file (below)
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongod.stop();
  server.close();
});

describe('Auth', () => {
  test('signup and login', async () => {
    const signup = await request(app)
      .post('/auth/signup')
      .send({ email: 'a@b.com', password: 'pass1234' })
      .expect(201);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pass1234' })
      .expect(200);

    expect(login.body.token).toBeDefined();
  });
});
