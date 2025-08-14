# 📽️ Media Access & Analytics Backend

A backend service for uploading media, generating **secure streaming links**, and tracking **view analytics**.  
Built with **Node.js**, **Express**, and **MongoDB**.

---

## 📖 Table of Contents
1. [Features](#-features)
2. [Tech Stack](#-tech-stack)
3. [Project Setup](#-project-setup)
4. [API Endpoints](#-api-endpoints)
   - [Auth Routes](#auth-routes)
   - [Media Routes](#media-routes)
   - [Analytics Routes](#analytics-routes)
5. [Database Schemas](#-database-schemas)
6. [Security](#-security)
7. [License](#-license)

---

## 🚀 Features
- **Admin Authentication** using JWT
- **Media Upload & Metadata Storage**
- **Secure Streaming URLs** (valid for 10 minutes)
- **View Logging** (IP + timestamp)
- **MongoDB with Mongoose ODM**
- **Protected Routes** for admins

---

## 🛠 Tech Stack
- **Node.js** (Express)
- **MongoDB** (Mongoose ODM)
- **JWT** for authentication
- **Multer** for media uploads
- **dotenv** for environment variables

---

## 📦 Project Setup

### 1️⃣ Clone Repository
```bash
git clone https://github.com/vanamkarthiknetha/klantroef.git
cd klantroef
```

### 2️⃣ Install Dependencies
```bash
npm install
```

### 3️⃣ Create `.env` file
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/media_access
JWT_SECRET=your_jwt_secret
BASE_URL=http://localhost:5000
```

### 4️⃣ Run Development Server
```bash
npm run dev
```

---

## 📌 API Endpoints

### **Auth Routes**

#### 1. Sign Up
**`POST /auth/signup`**

**Request Body**
```json
{
  "email": "admin@example.com",
  "password": "securePassword123"
}
```

**Response**
```json
{
  "message": "User registered successfully"
}
```

#### 2. Login
**`POST /auth/login`**

**Request Body**
```json
{
  "email": "admin@example.com",
  "password": "securePassword123"
}
```

**Response**
```json
{
  "token": "jwt_token_here"
}
```

---

### **Media Routes** *(Protected — Requires JWT in `Authorization` header)*

#### 3. Upload Media Metadata
**`POST /media`**

**Request Body**
```json
{
  "title": "Sample Video",
  "type": "video",
  "file_url": "https://cdn.example.com/video.mp4"
}
```

**Response**
```json
{
  "message": "Media asset created successfully",
  "media": { "id": "media_id_here" }
}
```

#### 4. Get Secure Stream URL
**`GET /media/:id/stream-url`**

**Response**
```json
{
  "stream_url": "https://cdn.example.com/video.mp4?token=secure_token&expires=timestamp"
}
```

---

### **Analytics Routes**

#### 5. Log Media View
*(Automatically triggered when stream URL is accessed)*

**`POST /media/:id/log-view`**

**Request Body**
```json
{
  "ip": "192.168.1.10",
  "timestamp": "2025-08-14T10:00:00Z"
}
```

**Response**
```json
{
  "message": "View logged successfully"
}
```

---

## 🗄 Database Schemas

### **AdminUser**
```json
{
  "id": "ObjectId",
  "email": "string",
  "hashed_password": "string",
  "created_at": "Date"
}
```

### **MediaAsset**
```json
{
  "id": "ObjectId",
  "title": "string",
  "type": "video | audio",
  "file_url": "string",
  "created_at": "Date"
}
```

### **MediaViewLog**
```json
{
  "media_id": "ObjectId",
  "viewed_by_ip": "string",
  "timestamp": "Date"
}
```

---

## 🔒 Security
- **JWT authentication** for admin routes  
- **Stream URLs** expire after **10 minutes**  
- Sensitive data stored in `.env` file

---

## 📜 License
MIT License

