export type InputItem = {
    "type": "text";
    text: string;
} | {
    "type": "image";
    image_url: string;
} | {
    "type": "localImage";
    path: string;
};
