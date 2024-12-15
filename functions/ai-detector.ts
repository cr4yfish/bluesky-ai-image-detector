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


const _ENDPOINT = "umm-maybe/AI-image-detector"

export const detectAI = cache(async (imageLink: string): Promise<DetectorResult> => {
    const inference = new HfInference(process.env.HF_ACCESS_TOKEN!);
    const result = await inference.imageClassification({
        data: await (await fetch(imageLink)).blob(),
        model: _ENDPOINT
    })
    const classification = result as unknown as Array<Classification>;

    return {
        human: classification.find(c => c.label == "human")?.score ?? 0,
        ai: classification.find(c => c.label == "artificial")?.score ?? 0
    }
})