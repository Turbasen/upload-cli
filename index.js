

const opts = require('nomnom')
  .script('upload')
  .option('file', {
    abbr: 'f',
    help: 'Image file upload',
  })
  .option('image', {
    abbr: 'i',
    help: 'Image id',
  })
  .option('patch-type', {
    abbr: 't',
    help: 'Patch object type',
  })
  .option('patch-id', {
    abbr: 'x',
    help: 'Patch object id',
  })
  .option('license', {
    abbr: 'l',
    help: 'Image license',
    default: 'CC BY-NC 4.0',
    choices: ['CC BY-NC 4.0', 'CC BY-SA 4.0'],
  })
  .option('title', {
    abbr: 't',
    help: 'Image title',
  })
  .option('desc', {
    abbr: 'd',
    help: 'Image description',
  })
  .option('name', {
    abbr: 'n',
    help: 'Image author name',
  })
  .option('email', {
    abbr: 'e',
    help: 'Image author email',
  })
  .option('ntb-api-env', {
    help: 'API environment',
    choices: ['api', 'dev'],
    default: 'dev',
  })
  .option('version', {
    flag: true,
    help: 'Print version and exit',
    callback: function() {
       return 'Version 1.0.0';
    }
  })
  .help('Upload images to Nasjonal Turbase and/or patch objects')
  .parse();

process.env.NTB_API_ENV = opts['ntb-api-env'];
const turbasen = require('turbasen');

if (!opts.file && !opts.image) {
  console.error('--file or --image must be specified');
  process.exit(1);
}

function checkFile(opts) {
  const stat = require('fs').stat;

  return new Promise((resolve, reject) => {
    if (!opts.file) { return resolve(opts); }

    stat(opts.file, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(opts);
      }
    });
  });
};

function uploadImage(opts) {
  const request = require('request');
  const createReadStream = require('fs').createReadStream;

  return new Promise((resolve, reject) => {
    if (!opts.file) { return resolve(opts); }

    console.log(`Uploading ${opts.file}...`);

    const url = process.env.UPLOAD_URL;
    const formData = {
      'image': createReadStream(opts.file),
    };

    request.post({url, formData, json: true}, (err, res, body) => {
      if (err) { return reject(err); }

      if (res.statusCode !== 201) {
        console.error(body);
        return reject(new Error('Image Upload Failed'));
      }

      console.log('Image Uploaded');

      opts.body = body;
      resolve(opts);
    });
  });
};

function saveImage(opts) {
  return new Promise((resolve, reject) => {
    if (!opts.body) { return resolve(opts); }

    console.log('Saving image...');

    const document = {
      navn: opts.title,
      lisens: opts.license,
      status: 'Offentlig',
      beskrivelse: opts.desc,
      fotograf: {
        navn: opts.name,
        telefon: opts.phone,
        epost: opts.email,
      },
      geojson: opts.body.meta.geojson,
      original: {
        size: opts.body.meta.size,
        format: opts.body.meta.format,
        colorspace: opts.body.meta.colorspace,
        height: opts.body.meta.height,
        width: opts.body.meta.width,
      },
      exif: {
        Artist: opts.body.meta.exif.Artist,
        Copyright: opts.body.meta.exif.Copyright,
        DateTime: opts.body.meta.exif.DateTime,
        DateTimeDigitized: opts.body.meta.exif.DateTimeDigitized,
        DocumentName: opts.body.meta.exif.DocumentName,
        ImageDescription: opts.body.meta.exif.ImageDescription,
        Make: opts.body.meta.exif.Make,
        Model: opts.body.meta.exif.Model,
        Software: opts.body.meta.exif.Software,
      },
      img: opts.body.versions,
    };

    turbasen.bilder.post(document, (err, res, body) => {
      if (err) { return reject(err); }

      for (const warning of body.warnings || []) {
        console.log(warning);
      }

      for (const error of body.errors || []) {
        console.log(error);
      }

      if (!body.document._id) {
        console.error(body);
        return reject(new Error('Image Save Failed'));
      }

      console.log(`Image ${body.document._id} Saved`);

      opts.image = body.document._id;
      resolve(opts);
    });
  });
};

function patchObject(opts) {
  return new Promise((resolve, reject) => {
    if (!opts['patch-type'] || !opts['patch-id']) {
      return resolve(opts);
    }

    const type = opts['patch-type'];
    const id = opts['patch-id'];

    console.log(`Patching ${type} @ ${id}`);

    const data = {
      '$push': {
        bilder: opts.image,
      },
    };

    turbasen[type].patch(id, data, (err, res, body) => {
      if (err) { return reject(err); }

      if (res.statusCode !== 200) {
        console.error(body);
        return reject(new Error(`Patch ${type} @ ${id} failed`));
      }

      console.log('Patch Done');

      resolve(opts);
    });
  });
};

checkFile(opts)
  .then(uploadImage)
  .then(saveImage)
  .then(patchObject)
  .then(() => console.log('Done!'))
  .catch(console.error.bind(console));

process.on('SIGINT', process.exit.bind(process, 1));
