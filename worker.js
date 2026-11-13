import { cluster, sensitivity } from "./core.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      result: cluster(data.model),
      sensitivity: sensitivity(data.model),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
