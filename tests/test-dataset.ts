/**
 * Test Dataset with Ground Truth Labels
 *
 * This file contains manually-labeled ground truth content for testing
 * Mozilla Readability's extraction accuracy.
 *
 * Each article includes:
 * - HTML file (raw web page)
 * - Expected title
 * - Expected content (clean article text without ads, navigation, etc.)
 * - Minimum expected word count
 */

export const TEST_ARTICLES = [
  {
    name: "Clean Blog Post",
    url: "https://example.com/blog/future-of-web-development",
    htmlFile: "sample-blog-post.html",
    groundTruth: {
      title: "The Future of Web Development",
      content: `Web development has evolved dramatically over the past decade, and the pace of change shows no signs of slowing down. As we look toward the future, several key trends are emerging that will shape how we build and interact with web applications.

The Rise of WebAssembly

WebAssembly (Wasm) is revolutionizing web performance by allowing developers to run code written in languages like C, C++, and Rust directly in the browser at near-native speeds. This technology opens up new possibilities for complex web applications, from video editing tools to 3D gaming engines, all running seamlessly in your browser without plugins.

Major companies are already leveraging WebAssembly for performance-critical components. For instance, Figma uses Wasm to deliver a smooth editing experience, and Google Earth has been rebuilt using WebAssembly to provide faster load times and better performance.

Progressive Web Applications

Progressive Web Applications (PWAs) continue to blur the line between web and native applications. PWAs offer offline functionality, push notifications, and the ability to be installed on devices, providing a native-like experience while maintaining the accessibility and cross-platform benefits of web technologies.

The adoption of PWAs is growing rapidly, with companies like Twitter, Starbucks, and Uber all offering PWA versions of their applications. These apps load instantly, work offline, and consume less data than traditional native apps, making them especially valuable in markets with limited connectivity.

The Serverless Revolution

Serverless architectures are transforming how we think about backend development. With serverless platforms like AWS Lambda, Vercel Edge Functions, and Cloudflare Workers, developers can focus on writing code without managing infrastructure. This shift reduces operational complexity and allows for more efficient scaling.

Edge computing takes this a step further by running code closer to users, reducing latency and improving performance. This is particularly important for globally distributed applications where response time is critical.

AI-Assisted Development

Artificial intelligence is becoming an integral part of the development workflow. Tools like GitHub Copilot and ChatGPT are helping developers write code faster and more efficiently. These AI assistants can suggest complete functions, help debug issues, and even explain complex code.

However, the rise of AI in development doesn't mean developers are becoming obsolete. Instead, it's shifting the focus from writing boilerplate code to higher-level problem solving and architecture decisions. Developers who can effectively leverage AI tools will have a significant advantage in productivity.

Conclusion

The future of web development is exciting and full of possibilities. As these technologies mature and new ones emerge, developers must stay curious and adaptable. The web platform continues to evolve, becoming more powerful and capable with each passing year. Whether you're a seasoned developer or just starting out, there's never been a more exciting time to be building for the web.`,
      minWordCount: 400
    }
  },
  {
    name: "News Article with Ads",
    url: "https://example.com/news/renewable-energy-breakthrough",
    htmlFile: "news-article.html",
    groundTruth: {
      title: "Major Breakthrough in Renewable Energy Technology",
      content: `Scientists at the Massachusetts Institute of Technology announced today a significant breakthrough in renewable energy storage that could revolutionize how we harness and use clean energy. The new battery technology promises to store solar and wind energy more efficiently than ever before.

The research team, led by Dr. Michael Chen, has developed a novel battery chemistry that can store three times more energy than conventional lithium-ion batteries while costing significantly less to produce. This advancement addresses one of the biggest challenges facing renewable energy adoption: the ability to store energy when the sun isn't shining and the wind isn't blowing.

How It Works

The new battery uses abundant materials including aluminum and sulfur, making it both environmentally friendly and cost-effective. Unlike traditional batteries that degrade over time, these new batteries maintain their capacity even after thousands of charge cycles.

Dr. Chen explained that the breakthrough came from understanding how to prevent the formation of dendrites, tiny metal filaments that typically cause batteries to short circuit and fail. By using a specially designed electrolyte, the team was able to create a stable battery that can last for decades.

Impact on Climate Goals

Environmental experts are calling this development a potential game-changer in the fight against climate change. The ability to store renewable energy efficiently and affordably could accelerate the transition away from fossil fuels.

The International Energy Agency estimates that widespread adoption of this technology could reduce global carbon emissions by up to fifteen percent within the next decade. This would bring many countries significantly closer to their climate targets set in the Paris Agreement.

Next Steps

The technology is currently in the prototype phase, but the research team expects to begin pilot production within eighteen months. Several major energy companies have already expressed interest in licensing the technology.

MIT has announced plans to partner with industry leaders to scale up production and make the batteries available commercially by late 2025. The university is also working on making the technology accessible to developing nations through favorable licensing agreements.

While challenges remain, including scaling up production and ensuring consistent quality, the breakthrough represents a major step forward in renewable energy technology. As the world continues to grapple with climate change, innovations like this offer hope for a sustainable future.`,
      minWordCount: 300
    }
  },
  {
    name: "Technical Blog Post",
    url: "https://example.com/dev/async-await-javascript",
    htmlFile: "technical-article.html",
    groundTruth: {
      title: "Understanding Async/Await in JavaScript",
      content: `Asynchronous programming can be challenging for developers new to JavaScript. The async/await syntax, introduced in ES2017, provides a cleaner and more intuitive way to work with promises and asynchronous code.

What is Async/Await?

Async/await is syntactic sugar built on top of promises. It allows you to write asynchronous code that looks and behaves more like synchronous code, making it easier to read and maintain. The async keyword is used to declare an asynchronous function, while await pauses execution until a promise is resolved.

Basic Usage

Here's a simple example of how to use async/await to fetch data from an API. Instead of chaining multiple then callbacks, you can write code that reads from top to bottom.

Notice how the code flows naturally. We await the fetch request, then await the JSON parsing, and handle any errors in a familiar try-catch block.

Error Handling

One of the biggest advantages of async/await is improved error handling. With promises, you need to remember to add catch handlers throughout your chain. With async/await, you can use standard try-catch blocks, which most developers are already familiar with.

When an await expression throws an error, it can be caught by a surrounding try-catch block. This makes error handling more predictable and easier to debug.

Parallel Execution

A common mistake when using async/await is accidentally making sequential calls that could run in parallel. If you have multiple independent asynchronous operations, you should run them concurrently using Promise.all.

The parallel version executes both operations simultaneously, significantly reducing total execution time when operations are independent.

Common Pitfalls

While async/await simplifies asynchronous code, there are several common mistakes to avoid. First, remember that await only works inside async functions. Second, forgetting to handle errors can lead to unhandled promise rejections. Finally, overusing await can unnecessarily serialize operations that could run in parallel.

Conclusion

Async/await has become the standard way to handle asynchronous operations in modern JavaScript. It provides cleaner, more readable code while maintaining all the power of promises. By understanding how to properly use async/await, including error handling and parallel execution, you can write more maintainable and efficient asynchronous code.`,
      minWordCount: 250
    }
  }
];
