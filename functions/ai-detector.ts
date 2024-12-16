/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { HfInference } from "@huggingface/inference";
import { cache } from "react";

type DetectorResult = {
  human: number,
  ai: number
}
  
type Classification = {
  label: "human" | "artificial",
  score: number
}

type Detector = 
  "dima806/deepfake_vs_real_image_detection" |
  "umm-maybe/AI-image-detector" |
  "Nahrawy/AIorNot" |
  "Organika/sdxl-detector"

const _ENDPOINT: string = "dima806/deepfake_vs_real_image_detection"

export const detectAI = cache(async (imageLink: string): Promise<DetectorResult> => {
    const inference = new HfInference(process.env.HF_ACCESS_TOKEN!);
    const result = await inference.imageClassification({
        data: await (await fetch(imageLink)).blob(),
        model: _ENDPOINT
    })
    console.log("Result:",result)

    let adapaterResult;

    // Adapt results to Classification schema
    switch(_ENDPOINT as Detector) {

      // Handlers for other schemas
      case "dima806/deepfake_vs_real_image_detection":
        adapaterResult = [
          {
            label: "human",
            score: result.find(r => r.label == "Real")?.score ?? 0
          },
          {
            label: "artificial",
            score: result.find(r => r.label == "Fake")?.score ?? 0
          }
        ]
        break;
      case "Nahrawy/AIorNot":
        adapaterResult = [
          {
            label: "human",
            score: result.find(r => r.label == "real")?.score ?? 0
          },
          {
            label: "artificial",
            score: result.find(r => r.label == "ai")?.score ?? 0
          }
        ];
        break;

      // uses default schema
      case "umm-maybe/AI-image-detector":
      case "Organika/sdxl-detector":
      default:
        adapaterResult = result;
        break;
    }

    const classification = adapaterResult as unknown as Array<Classification>;

    return {
        human: classification.find(c => c.label == "human")?.score ?? 0,
        ai: classification.find(c => c.label == "artificial")?.score ?? 0
    }
})