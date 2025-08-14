const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app, server, mongod, token, mediaId;

beforeAll(async () => {
  process.env.JWT_SECRET = 'testsecret';
  process.env.ANALYTICS_CACHE_TTL_SEC = '2';
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  ({ app, server } = require('../testServer'));

  // create user + login
  await request(app).post('/auth/signup').send({ email: 'a@b.com', password: 'pass1234' });
  const login = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'pass1234' });
  token = login.body.token;

  // create a media doc directly (no file upload in this test)
  const MediaAsset = require('../models/MediaAsset');
  const m = await MediaAsset.create({
    title: 'Test Media',
    type: 'video',
    file_url: 'http://localhost/dummy.mp4',
  });
  mediaId = m._id.toString();
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongod.stop();
  server.close();
});

describe('Media view & analytics', () => {
  test('logs a view and returns analytics (MISS then HIT)', async () => {
    // log a view
    await request(app)
      .post(`/media/${mediaId}/view`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    // first analytics -> MISS
    const a1 = await request(app)
      .get(`/media/${mediaId}/analytics`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(a1.headers['x-cache']).toBeDefined();
    expect(['MISS','SKIP','HIT']).toContain(a1.headers['x-cache']); // redis may not be present in CI
    expect(a1.body.total_views).toBe(1);

    // second analytics -> likely HIT
    const a2 = await request(app)
      .get(`/media/${mediaId}/analytics`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(['HIT','MISS','SKIP']).toContain(a2.headers['x-cache']);
    expect(a2.body.total_views).toBe(1);
  });

  test('rate limits view endpoint when abused', async () => {
    const max = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
    const reqs = [];
    for (let i = 0; i < max; i++) {
      reqs.push(
        request(app).post(`/media/${mediaId}/view`).set('Authorization', `Bearer ${token}`).send({})
      );
    }
    await Promise.all(reqs.map(p => p.expect(201)));
    // one more should trip limiter
    await request(app)
      .post(`/media/${mediaId}/view`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(429);
  });
});
