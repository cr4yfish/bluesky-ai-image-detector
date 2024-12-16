/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { AtpAgent, AtpSessionData } from "@atproto/api";
import { PostView, ThreadViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { cache } from "react";
import { detectAI } from "./ai-detector";
import { Notification } from "@atproto/api/dist/client/types/app/bsky/notification/listNotifications";

const agent =  new AtpAgent({
    service: "https://bsky.social"
});

let sessionData: AtpSessionData | undefined;

export const getAgent = cache(async (): Promise<AtpAgent> => {
    
    if(sessionData) {
        console.log("Resuming session")
        await agent.resumeSession(sessionData)
        return agent;
    }
    console.log("Creating new session")
    const { data } = await agent.login({
        identifier: process.env.BLUESKY_USERNAME! as string,
        password: process.env.BLUESKY_PASSWORD! as string
    })

    sessionData = data as AtpSessionData
    
    return agent;
})

export const getPost = async (uri: string): Promise<PostView> => {
    const agent = await getAgent();
    const { data: { thread: { post }} } = await agent.getPostThread({
        uri: uri,
        depth: 1
    })
    return post as PostView;
}

type Image = {
    fullsize: string,
    thumb: string
}

export const getImagesOfPost = async (post: PostView) => {
    const images = post.embed?.images as Array<Image>;
    return images?.map(image => image.thumb) ?? []
}

export const getNotifications = async (reason?: string[]): Promise<Notification[]> => {
    const agent = await getAgent();
    const { data: { notifications }} = await agent.listNotifications({
        limit: 10,
        reasons: reason
    });
    return notifications;
}

export const respondToComment = async (text: string, post: { uri: string, cid: string}, parent: { uri: string, cid: string }) => {
    console.log("Responding to comment");
    const agent = await getAgent();
    await agent.post({
        text,
        reply: {
            parent: {
                uri: parent.uri,
                cid: parent.cid
            },
            root: {
                uri: post.uri,
                cid: post.cid
            }
        }
    })
    console.log("Responded to comment");
}

export const classifyPost = async (post: PostView) => {
    console.log("Classyfing post")
    const images = await getImagesOfPost(post);
    if(images.length == 0) {
        throw new Error("I couldn't detect any images to classify.")
    }
    const latestImage = images[0];
    return await detectAI(latestImage);
}    

export const alreadyRepliedToComment = async({ uri }: { uri: string }): Promise<boolean> => {
    if(!uri) return false;
    const agent = await getAgent();
    const { data: { thread } } = await agent.getPostThread({
        uri: uri,
        depth: 1
    })

    const replies = thread.replies as ThreadViewPost[];

    return replies.some(reply => reply.post.author.handle === process.env.BLUESKY_HANDLE!);

}

export const runMainBotFeature = async () => {
    const notifications = await getNotifications();
    const mentions = notifications.filter(n => n.reason == "mention");
    console.log("Number of notifications:", mentions.length)

    if(mentions.length == 0) {
        return;
    }

    await Promise.all(
        mentions.map(async (mention) => {
            
            // check if already replied to this
            if(await alreadyRepliedToComment(mention)) {
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const record = mention.record as any;
            if(!record || !record.reply?.root?.uri) return;

            const rootPost = await getPost(record.reply.root.uri);
      
            let respondText = ""

            if(rootPost) {
                try {
                    const classification = await classifyPost(rootPost);
                    const percentage = Math.round(classification.ai*100) + "% probability";
                    const aiText = `This image is probably AI generated (${percentage})`
                    const humanText = `This image is probably not AI Generated (${percentage})`
                    respondText = `Hi there! ${classification.ai >= 0.5 ? aiText : humanText}`
                } catch(e) {
                    const err = e as Error;
                    respondText = `Oops! An error occurred: ${err.message}`
                }
            
                await respondToComment(respondText, rootPost, mention)
            }
        })
    )
}