import { Store, readCorpus } from "../lib/store";
const store = new Store();
try {
  console.log(
    `Imported ${store.importQuestions(readCorpus(process.argv[2]))} questions. Personal notes preserved.`,
  );
} finally {
  store.db.close();
}
