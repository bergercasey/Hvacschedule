const nodemailer = require('nodemailer');
exports.handler = async ()=>({ statusCode:200, body: JSON.stringify({ ok: true, hasSMTP: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) }) });
