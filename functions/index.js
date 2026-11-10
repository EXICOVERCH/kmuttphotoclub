const { initializeApp } = require('firebase-admin/app');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { Translate } = require('@google-cloud/translate').v2;

initializeApp();

const ADMIN_UID = 'sQV1r4r3uqbuTbVugTgIfcUBLz2';
const translator = new Translate();

async function translateText(text, target) {
  if (!text) return '';
  const [translation] = await translator.translate(text, { to: target });
  return translation;
}

exports.translateEventFields = onCall({ region: 'asia-southeast1', maxInstances: 3 }, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in as the administrator.');
  }
  if (request.auth.uid !== ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Only the configured administrator can translate event data.');
  }

  const { titleTh = '', titleEn = '', detailsTh = '', detailsEn = '' } = request.data || {};
  const fields = { titleTh, titleEn, detailsTh, detailsEn };
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value !== 'string') {
      throw new HttpsError('invalid-argument', `${name} must be text.`);
    }
  }
  if (!titleTh.trim() && !titleEn.trim()) {
    throw new HttpsError('invalid-argument', 'Enter an event title in Thai or English.');
  }
  if (titleTh.length > 300 || titleEn.length > 300 || detailsTh.length > 5000 || detailsEn.length > 5000) {
    throw new HttpsError('invalid-argument', 'Event title or details exceed the allowed length.');
  }

  const result = {
    titleTh: titleTh.trim(),
    titleEn: titleEn.trim(),
    detailsTh: detailsTh.trim(),
    detailsEn: detailsEn.trim()
  };

  const tasks = [];
  if (result.titleTh && !result.titleEn) {
    tasks.push(translateText(result.titleTh, 'en').then(text => { result.titleEn = text; }));
  } else if (result.titleEn && !result.titleTh) {
    tasks.push(translateText(result.titleEn, 'th').then(text => { result.titleTh = text; }));
  }
  if (result.detailsTh && !result.detailsEn) {
    tasks.push(translateText(result.detailsTh, 'en').then(text => { result.detailsEn = text; }));
  } else if (result.detailsEn && !result.detailsTh) {
    tasks.push(translateText(result.detailsEn, 'th').then(text => { result.detailsTh = text; }));
  }

  try {
    await Promise.all(tasks);
    return result;
  } catch (error) {
    console.error('Cloud Translation request failed:', error);
    throw new HttpsError('unavailable', 'Automatic translation is temporarily unavailable.');
  }
});
