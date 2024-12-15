"use server";

import { AtpAgent } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { cache } from "react";
import { detectAI } from "./ai-detector";

export const getAgent = cache(async (): Promise<AtpAgent> => {
    const agent =  new AtpAgent({
        service: "https://bsky.social"
    });
    await agent.login({
        identifier: process.env.BLUESKY_USERNAME! as string,
        password: process.env.BLUESKY_PASSWORD! as string
    })
    return agent;
})

export const testPost = async () => {
    const agent = await getAgent();
    await agent.post({
        text: "Hello World (testing out the API)",
    })
}

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

export const getNotifications = async (reason?: string[]) => {
    const agent = await getAgent();
    const { data: { notifications }} = await agent.listNotifications({
        limit: 10,
        reasons: reason
    });
    return notifications;
}

export const respondToPost = async(text: string, post: { uri: string, cid: string }) => {
    console.log("Responding to post")
    const agent = await getAgent();
    await agent.post({
        text,
        reply: {
            root: {
                uri: post.uri,
                cid: post.cid
            },
            parent: {
                uri: post.uri,
                cid: post.cid
            }
        }
    })
    console.log("Responded to post")
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

export const respondToNotfications = async (text: string, reasons: string[]) => {
    const replies = await getNotifications(reasons);
    replies.forEach(async (reply) => {
        const agent = await getAgent();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const record = reply.record as Record<string, any>;

        const isReply = record.reply?.root?.uri ? true : false;

        await agent.post({
            text: text,
            reply: {
                root: {
                    uri: isReply ? record.reply.root.uri : reply.uri,
                    cid: isReply ? record.reply.root.cid : reply.cid
                },
                parent: {
                    uri: reply.uri,
                    cid: reply.cid
                }
            }
        })
    })
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


export const runMainBotFeature = async () => {
    const notifications = await getNotifications();
    const unreadMentions = notifications.filter(n => !n.isRead && n.reason == "mention");

    if(unreadMentions.length == 0) {
        return;
    }

    await Promise.all(
        unreadMentions.map(async (mention) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const record = mention.record as any;
            const rootPost = await getPost(record.reply.root.uri);
      
            let respondText = ""

            if(rootPost) {
                try {
                    const classification = await classifyPost(rootPost);
                    const percentage = Math.round(classification.ai*100) + "% probability";
                    const aiText = `This image is probably AI generated (${percentage})`
                    const humanText = `This image is probably not AI Generated (${percentage})`
                    respondText = `Hi there! ${classification.ai > 50 ? aiText : humanText}`
                } catch(e) {
                    const err = e as Error;
                    respondText = `Oops! An error occurred: ${err.message}`
                }
            
                await respondToComment(respondText, rootPost, mention)
            }
        })
    )
}