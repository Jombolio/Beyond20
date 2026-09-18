/* Rebuilds FVTT-module/beyond20.zip from FVTT-module/beyond20/.
 *
 * The zip is committed to the repository and is what Foundry downloads, so it has to be rebuilt
 * whenever the module changes. It spent a year out of step with the source because it was packed by
 * hand, which is what shipped a module without any of the v13 fixes in it.
 *
 * Two things keep the output stable so git only sees a new blob when the module actually changed:
 * text files are written with LF endings whatever the checkout has, and every entry gets the same
 * fixed timestamp.
 *
 * Usage: node tools/build-fvtt-zip.js [--check]
 *        --check reports whether the zip is up to date and writes nothing.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..", "FVTT-module");
const SOURCE_DIR = path.join(ROOT, "beyond20");
const ZIP_PATH = path.join(ROOT, "beyond20.zip");
// The module folder has to stay at the top level of the zip for Foundry to install it
const PREFIX = "beyond20";
const TEXT_EXTENSIONS = new Set([".js", ".css", ".json", ".svg", ".md", ".txt", ".html"]);
// A fixed DOS timestamp (1980-01-01 00:00:00) keeps rebuilds byte for byte identical
const DOS_TIME = 0;
const DOS_DATE = 33;

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c;
    }
    return table;
})();

function crc32(buffer) {
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
}

function listFiles(dir) {
    const entries = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) entries.push(...listFiles(full));
        else if (entry.isFile()) entries.push(full);
    }
    // Sort by the path that goes into the zip, so entry order never depends on the filesystem
    return entries.sort();
}

function readEntry(file) {
    const relative = path.relative(SOURCE_DIR, file).split(path.sep).join("/");
    let contents = fs.readFileSync(file);
    if (TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        contents = Buffer.from(contents.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    }
    return { name: `${PREFIX}/${relative}`, contents };
}

function buildZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name, "utf8");
        const crc = crc32(entry.contents);
        const deflated = zlib.deflateRawSync(entry.contents, { level: 9 });
        // Storing is smaller than deflating for files that don't compress
        const stored = deflated.length >= entry.contents.length;
        const data = stored ? entry.contents : deflated;
        const method = stored ? 0 : 8;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);            // version needed
        local.writeUInt16LE(0, 6);             // flags
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(entry.contents.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);            // extra length
        chunks.push(local, name, data);

        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4);           // version made by
        header.writeUInt16LE(20, 6);           // version needed
        header.writeUInt16LE(0, 8);            // flags
        header.writeUInt16LE(method, 10);
        header.writeUInt16LE(DOS_TIME, 12);
        header.writeUInt16LE(DOS_DATE, 14);
        header.writeUInt32LE(crc, 16);
        header.writeUInt32LE(data.length, 20);
        header.writeUInt32LE(entry.contents.length, 24);
        header.writeUInt16LE(name.length, 28);
        header.writeUInt16LE(0, 30);           // extra length
        header.writeUInt16LE(0, 32);           // comment length
        header.writeUInt16LE(0, 34);           // disk number
        header.writeUInt16LE(0, 36);           // internal attributes
        header.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes, a regular 644 file
        header.writeUInt32LE(offset, 42);
        central.push(header, name);

        offset += local.length + name.length + data.length;
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);                   // disk number
    end.writeUInt16LE(0, 6);                   // disk with the central directory
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);                  // comment length

    return Buffer.concat([...chunks, directory, end]);
}

const entries = listFiles(SOURCE_DIR).map(readEntry);
if (entries.length === 0) {
    console.error(`No files found in ${SOURCE_DIR}`);
    process.exit(1);
}
const zip = buildZip(entries);
const current = fs.existsSync(ZIP_PATH) ? fs.readFileSync(ZIP_PATH) : null;
const upToDate = current !== null && current.equals(zip);

if (process.argv.includes("--check")) {
    if (upToDate) {
        console.log(`beyond20.zip is up to date (${entries.length} files)`);
        process.exit(0);
    }
    console.error("beyond20.zip is out of date with FVTT-module/beyond20/. Run: npm run build:fvtt-zip");
    process.exit(1);
}

if (upToDate) {
    console.log(`beyond20.zip already up to date (${entries.length} files)`);
} else {
    fs.writeFileSync(ZIP_PATH, zip);
    console.log(`Wrote ${path.relative(process.cwd(), ZIP_PATH)} (${entries.length} files, ${zip.length} bytes)`);
}
