const mongoose = require('mongoose');

const MediaAssetSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['video', 'audio'], required: true },
  file_url: { type: String, required: true },
  original_filename: { type: String },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MediaAsset', MediaAssetSchema);
