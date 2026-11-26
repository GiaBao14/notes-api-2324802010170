const express = require('express');
const multer = require('multer');
const Note = require('../models/note');
const { bucket } = require('../storage');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Yêu cầu đăng nhập cho tất cả API /notes
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

// Lấy danh sách ghi chú của người dùng hiện tại
router.get('/', async (req, res) => {
  const filter = { owner: req.user.sub };

  if (req.query.tag) {
    filter.tags = String(req.query.tag);
  }

  const notes = await Note.find(filter)
    .sort({ createdAt: -1 })
    .limit(50);

  res.json(notes);
});

// Lấy một ghi chú thuộc người dùng hiện tại
router.get('/:id', async (req, res) => {
  const note = await Note.findOne({
    _id: req.params.id,
    owner: req.user.sub
  });

  if (!note) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  res.json(note);
});

// Tạo ghi chú gắn với người dùng hiện tại
router.post('/', async (req, res) => {
  const { title, content, tags } = req.body ?? {};

  const note = await Note.create({
    title,
    content,
    tags,
    owner: req.user.sub
  });

  res.status(201).json(note);
});

// Chỉ cập nhật ghi chú của người dùng hiện tại
router.put('/:id', async (req, res) => {
  const { title, content, tags } = req.body ?? {};

  const note = await Note.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: req.user.sub
    },
    { title, content, tags },
    { new: true, runValidators: true }
  );

  if (!note) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  res.json(note);
});

// Chỉ xóa ghi chú của người dùng hiện tại
router.delete('/:id', async (req, res) => {
  const note = await Note.findOneAndDelete({
    _id: req.params.id,
    owner: req.user.sub
  });

  if (!note) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  res.status(204).end();
});

// Chỉ tải tệp lên ghi chú của người dùng hiện tại
router.post('/:id/attachment', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Thiếu tệp ở trường "file"' });
  }

  const note = await Note.findOne({
    _id: req.params.id,
    owner: req.user.sub
  });

  if (!note) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  const safeName = req.file.originalname
    .normalize('NFD')
    .replace(/[^\w.-]/g, '_');

  const path = `${note._id}/${Date.now()}-${safeName}`;

  const { error } = await bucket().upload(path, req.file.buffer, {
    contentType: req.file.mimetype
  });

  if (error) throw error;

  note.attachmentUrl = bucket().getPublicUrl(path).data.publicUrl;

  await note.save();

  res.json(note);
});

module.exports = router;
