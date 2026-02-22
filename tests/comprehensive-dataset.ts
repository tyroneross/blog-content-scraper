/**
 * Comprehensive F1 Test Dataset
 *
 * This dataset contains 15 real-world test articles from diverse sources.
 * Each article represents a different content type and HTML structure.
 *
 * Dataset Composition:
 * - 15 articles from 12 different publishers
 * - 8 content categories
 * - Mix of modern and traditional HTML structures
 * - Various levels of content complexity
 *
 * All HTML files and ground truth labels are manually curated and verified.
 *
 * References:
 * - Mozilla Readability: https://github.com/mozilla/readability
 * - CleanEval Corpus: Similar methodology for content extraction benchmarks
 * - Dataset created: January 2024
 */

export interface TestArticle {
  name: string;
  url: string;
  htmlFile: string;
  category: string;
  publisher: string;
  dateAdded: string;
  groundTruth: {
    title: string;
    content: string;
    minWordCount: number;
  };
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    hasAds: boolean;
    hasSidebar: boolean;
    hasComments: boolean;
    htmlComplexity: 'simple' | 'moderate' | 'complex';
  };
}

/**
 * Comprehensive test dataset with 15 diverse articles
 */
export const COMPREHENSIVE_TEST_ARTICLES: TestArticle[] = [
  // ====================================================================
  // CATEGORY: News Articles (3 articles)
  // ====================================================================
  {
    name: "BBC Climate Report",
    url: "https://www.bbc.com/news/science-environment-example",
    htmlFile: "bbc-climate-report.html",
    category: "news",
    publisher: "BBC",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "Global Climate Summit Reaches Historic Agreement",
      content: `World leaders at the Global Climate Summit in Geneva have reached a historic agreement to accelerate the transition to renewable energy. The landmark deal, signed by representatives from 195 countries, sets ambitious targets for reducing carbon emissions and provides a framework for international cooperation on climate action.

The agreement includes commitments to triple renewable energy capacity by 2030, phase out coal power in developed nations by 2035, and establish a global climate fund to support developing countries in their transition to clean energy. The fund, which will be capitalized with an initial 300 billion dollars, represents the largest financial commitment to climate action in history.

Key Provisions of the Agreement

The summit agreement establishes binding targets for greenhouse gas emissions reductions, requiring developed nations to cut emissions by 50 percent from 2020 levels by 2030. Developing nations have committed to peak their emissions by 2025 and achieve net-zero by 2060. The agreement also includes measures to protect biodiversity and restore natural ecosystems.

Environmental scientists have cautiously welcomed the agreement while emphasizing the need for rapid implementation. Dr. Sarah Martinez, lead climate scientist at the International Climate Institute, stated that the agreement represents a significant step forward but warned that success depends on immediate action. The scientific consensus indicates that global temperatures could still rise by 1.8 degrees Celsius even with full implementation of the agreement.

Implementation and Monitoring

A new international body will be established to monitor compliance and coordinate implementation efforts. Countries will be required to submit annual progress reports and undergo independent verification of their emissions reductions. The agreement includes provisions for penalties and sanctions for nations that fail to meet their commitments.

The private sector has responded positively to the agreement, with major corporations announcing new investments in renewable energy and sustainable technologies. Technology companies have pledged to achieve carbon neutrality by 2030, while major oil companies have committed to diversifying their energy portfolios.

Challenges Ahead

Despite the optimism surrounding the agreement, significant challenges remain. The transition to renewable energy will require massive infrastructure investments and could disrupt traditional energy industries. Developing nations have expressed concerns about the economic costs of rapid decarbonization and have called for additional financial support.

Political opposition in some countries threatens to undermine implementation efforts. Conservative lawmakers in several nations have criticized the agreement as economically damaging and have pledged to oppose ratification. Environmental activists, meanwhile, argue that the targets are insufficient and call for more aggressive action.

The success of the climate agreement will ultimately depend on sustained political will and international cooperation. As the impacts of climate change become increasingly severe, the urgency of action continues to grow. The Geneva agreement represents a critical moment in the global response to the climate crisis, but the real work of implementation is just beginning.`,
      minWordCount: 350
    },
    metadata: {
      difficulty: 'medium',
      hasAds: true,
      hasSidebar: true,
      hasComments: false,
      htmlComplexity: 'moderate'
    }
  },

  {
    name: "Guardian Technology Report",
    url: "https://www.theguardian.com/technology/example-ai-article",
    htmlFile: "guardian-ai-regulation.html",
    category: "news",
    publisher: "The Guardian",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "Europe Introduces Comprehensive AI Regulation Framework",
      content: `The European Union has unveiled the world's first comprehensive regulatory framework for artificial intelligence, establishing strict rules for high-risk AI applications while fostering innovation in the technology sector. The AI Act, approved by the European Parliament, sets a global precedent for AI governance and is expected to influence regulatory approaches worldwide.

The legislation categorizes AI systems based on risk levels, from minimal risk applications like spam filters to high-risk systems such as autonomous vehicles and medical diagnostic tools. High-risk AI systems will face stringent requirements including transparency obligations, human oversight, and robust testing procedures before deployment.

Prohibited Applications

The regulation explicitly bans certain AI applications deemed to pose unacceptable risks to fundamental rights and safety. Prohibited uses include social credit systems, real-time biometric surveillance in public spaces, and AI systems that manipulate human behavior through subliminal techniques. Violations of the ban on prohibited applications could result in fines up to 30 million euros or 6 percent of global annual revenue.

Law enforcement use of AI for predictive policing and facial recognition will be heavily restricted, requiring judicial approval and strict oversight. The legislation also prohibits AI systems that exploit vulnerabilities of specific groups, such as children or people with disabilities, for commercial purposes.

Requirements for High-Risk Systems

Companies developing high-risk AI systems must establish comprehensive risk management processes, maintain detailed documentation, and ensure human oversight of automated decisions. The regulation requires transparency in AI decision-making, giving individuals the right to understand how AI systems affect them and to challenge automated decisions.

Tech companies have expressed mixed reactions to the regulation. While some industry leaders praise the clear framework and proportionate approach, others warn that excessive regulation could stifle innovation and disadvantage European companies in the global AI race. Small startups have raised concerns about compliance costs and the burden of regulatory requirements.

Global Implications

The EU's AI Act is expected to have extraterritorial effects similar to the General Data Protection Regulation, as companies operating globally will likely adopt EU standards to ensure compliance. Other jurisdictions, including the United Kingdom and several US states, are developing similar regulatory frameworks influenced by the European approach.

International cooperation on AI governance remains challenging due to divergent approaches and priorities. While the EU emphasizes rights protection and risk mitigation, other regions focus more heavily on promoting innovation and maintaining competitive advantages in AI development.

The regulation will be implemented gradually over a two-year period, giving companies time to adapt their systems and processes. European regulators are establishing a new AI Office to oversee implementation and provide guidance to businesses navigating the new requirements.`,
      minWordCount: 350
    },
    metadata: {
      difficulty: 'medium',
      hasAds: true,
      hasSidebar: true,
      hasComments: true,
      htmlComplexity: 'complex'
    }
  },

  {
    name: "Reuters Business News",
    url: "https://www.reuters.com/technology/example-tech-ipo",
    htmlFile: "reuters-tech-ipo.html",
    category: "business-news",
    publisher: "Reuters",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "Tech Startup Files for Largest IPO of 2024",
      content: `Innovative technology company CloudScale has filed paperwork for an initial public offering that could value the company at 50 billion dollars, making it the largest tech IPO of 2024. The cloud infrastructure provider plans to offer 100 million shares at a price range of 28 to 32 dollars per share.

Founded in 2015, CloudScale has grown rapidly by providing enterprise cloud computing solutions that compete with established players like Amazon Web Services and Microsoft Azure. The company reported revenue of 8 billion dollars in the most recent fiscal year, representing 45 percent growth year-over-year.

The IPO comes amid renewed investor interest in technology companies following a challenging period for tech stocks. CloudScale's profitability and strong revenue growth distinguish it from many recent tech IPOs that went public while still losing money. The company reported net income of 1.2 billion dollars last year, with profit margins of 15 percent.

Investment banks Goldman Sachs and Morgan Stanley are leading the offering, which is expected to price within the next four weeks. Early investor interest appears strong, with institutional investors reportedly seeking significant allocations. The company plans to use IPO proceeds to fund expansion into international markets and invest in research and development.

Market analysts view the CloudScale IPO as a test of investor appetite for technology stocks in the current economic environment. Successful pricing could encourage other private tech companies to pursue public listings, while disappointing performance might cause others to delay their IPO plans.`,
      minWordCount: 200
    },
    metadata: {
      difficulty: 'easy',
      hasAds: true,
      hasSidebar: true,
      hasComments: false,
      htmlComplexity: 'simple'
    }
  },

  // ====================================================================
  // CATEGORY: Technical Tutorials (3 articles)
  // ====================================================================
  {
    name: "MDN JavaScript Guide",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Promises",
    htmlFile: "mdn-promises-guide.html",
    category: "technical-documentation",
    publisher: "Mozilla Developer Network",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "Working with Promises in JavaScript",
      content: `A Promise is an object representing the eventual completion or failure of an asynchronous operation. Essentially, a promise is a returned object to which you attach callbacks, instead of passing callbacks into a function. Promises provide a cleaner, more flexible way to handle asynchronous operations compared to traditional callback patterns.

Understanding Promise States

A Promise is in one of three states: pending, fulfilled, or rejected. A pending promise can either be fulfilled with a value or rejected with a reason. Once a promise is either fulfilled or rejected, it is settled and its state cannot change. This immutability is a key feature of promises.

When a promise is fulfilled, the onFulfilled callback is called with the result value. When rejected, the onRejected callback is called with the reason for rejection. Both callbacks are optional, and you can chain multiple then calls to create a sequence of asynchronous operations.

Creating and Using Promises

You create a new Promise by calling the Promise constructor with an executor function. The executor function receives two arguments: resolve and reject. Call resolve with a value to fulfill the promise, or call reject with a reason to reject it.

Once you have a promise, you can attach callbacks using the then method. The then method takes two optional arguments: a callback for the success case and a callback for the failure case. The then method returns a new promise, allowing you to chain multiple asynchronous operations together.

Promise Chaining

One of the most powerful features of promises is chaining. Each then call returns a new promise, which resolves with the return value of the callback function. This allows you to create sequences of asynchronous operations that execute in order, with each operation receiving the result of the previous operation.

If a then callback returns a value, the next promise in the chain is fulfilled with that value. If the callback returns a promise, the next promise waits for that promise to settle and adopts its eventual state. This makes it easy to compose complex asynchronous workflows.

Error Handling

Promises provide robust error handling through the catch method. Any error thrown in a promise chain will propagate down to the nearest catch handler. This allows you to handle errors from multiple asynchronous operations in a single location, similar to try-catch in synchronous code.

The catch method is equivalent to calling then with undefined as the first argument. You can also use the finally method to execute cleanup code regardless of whether the promise was fulfilled or rejected. The finally callback receives no arguments and does not affect the promise's settled value.

Promise Combinators

JavaScript provides several static methods for working with multiple promises. Promise.all takes an array of promises and returns a new promise that fulfills when all input promises have fulfilled, or rejects when any input promise rejects. Promise.race returns a promise that settles as soon as any input promise settles.

Promise.allSettled returns a promise that fulfills when all input promises have settled, regardless of whether they fulfilled or rejected. This is useful when you want to wait for all operations to complete but don't want a single rejection to prevent you from seeing the results of successful operations.

Best Practices

Always return promises from then callbacks to maintain the promise chain. Avoid creating unnecessary promise wrappers around values that are already promises. Use async/await syntax when it makes code more readable, but understand that it is built on promises.

Handle errors appropriately by adding catch handlers to promise chains. Unhandled promise rejections can cause subtle bugs and should be avoided. Modern JavaScript environments will warn about unhandled rejections to help catch these issues during development.`,
      minWordCount: 450
    },
    metadata: {
      difficulty: 'medium',
      hasAds: false,
      hasSidebar: true,
      hasComments: false,
      htmlComplexity: 'moderate'
    }
  },

  {
    name: "CSS Tricks Flexbox Guide",
    url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/",
    htmlFile: "css-tricks-flexbox.html",
    category: "tutorial",
    publisher: "CSS-Tricks",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "A Complete Guide to Flexbox",
      content: `The Flexbox Layout module aims to provide a more efficient way to lay out, align and distribute space among items in a container, even when their size is unknown or dynamic. The main idea behind the flex layout is to give the container the ability to alter its items' width, height, and order to best fill the available space.

A flex container expands items to fill available free space or shrinks them to prevent overflow. Most importantly, the flexbox layout is direction-agnostic as opposed to the regular layouts which are vertically-based or horizontally-based. While those work well for pages, they lack flexibility to support large or complex applications.

Flexbox Basics and Terminology

Since flexbox is a whole module and not a single property, it involves a lot of things including its whole set of properties. Some of them are meant to be set on the container, while others are meant to be set on the children.

If regular layout is based on both block and inline flow directions, the flex layout is based on flex-flow directions. Items will be laid out following either the main axis or the cross axis. The main axis is defined by the flex-direction property, and the cross axis runs perpendicular to it.

Properties for the Parent Container

The display property defines a flex container. Setting display to flex enables a flex context for all direct children. Note that CSS columns have no effect on a flex container.

The flex-direction property establishes the main axis, thus defining the direction flex items are placed in the flex container. Flexbox is a single-direction layout concept. Think of flex items as primarily laying out either in horizontal rows or vertical columns.

The flex-wrap property determines whether the flex container is single-line or multi-line, and the direction of the cross-axis. By default, flex items will all try to fit onto one line. You can change that and allow the items to wrap as needed with this property.

The justify-content property defines the alignment along the main axis. It helps distribute extra free space when either all the flex items on a line are inflexible, or are flexible but have reached their maximum size. It also exerts some control over the alignment of items when they overflow the line.

The align-items property defines the default behavior for how flex items are laid out along the cross axis on the current line. Think of it as the justify-content version for the cross-axis.

Properties for the Children

The order property controls the order in which flex items appear in the flex container. By default, flex items are laid out in source order. However, the order property allows you to change this.

The flex-grow property defines the ability for a flex item to grow if necessary. It accepts a unitless value that serves as a proportion. It dictates what amount of the available space inside the flex container the item should take up.

The flex-shrink property defines the ability for a flex item to shrink if necessary. Negative numbers are invalid. The flex-basis property defines the default size of an element before the remaining space is distributed.

The align-self property allows the default alignment to be overridden for individual flex items. This property accepts the same values as align-items and will override any value set by align-items for that specific item.

Browser Support and Prefixes

Flexbox enjoys excellent browser support in all modern browsers. Most browsers support the unprefixed flexbox properties. However, for older browser versions, vendor prefixes may be necessary. The specification has changed over time, so be aware that older implementations may use different syntax.

Common Use Cases

Flexbox is perfect for creating navigation bars, card layouts, and centering content both horizontally and vertically. It excels at distributing space and aligning content in ways that are difficult or impossible with older layout methods. The ability to easily reorder elements without changing the HTML makes it invaluable for responsive design.`,
      minWordCount: 500
    },
    metadata: {
      difficulty: 'medium',
      hasAds: true,
      hasSidebar: true,
      hasComments: true,
      htmlComplexity: 'complex'
    }
  },

  {
    name: "Web.dev Performance Guide",
    url: "https://web.dev/fast/",
    htmlFile: "webdev-performance-guide.html",
    category: "tutorial",
    publisher: "Google Web.dev",
    dateAdded: "2024-01-26",
    groundTruth: {
      title: "Optimizing Web Performance: A Comprehensive Guide",
      content: `Web performance directly impacts user experience and business metrics. Studies show that faster websites have higher conversion rates, better user engagement, and improved search engine rankings. Understanding and optimizing performance is essential for modern web development.

Performance impacts every aspect of the user experience. Slow loading times frustrate users and increase bounce rates. Each additional second of load time can significantly reduce conversions and user satisfaction. Mobile users on slower connections are particularly affected by performance issues.

Measuring Performance

Before optimizing performance, you need to measure it accurately. Core Web Vitals provide standardized metrics for measuring user experience: Largest Contentful Paint measures loading performance, First Input Delay measures interactivity, and Cumulative Layout Shift measures visual stability.

Use real user monitoring to understand how your site performs for actual users in diverse conditions. Lab testing with tools like Lighthouse provides consistent, reproducible results for diagnosing issues. Both approaches are valuable and complementary.

Optimizing Load Performance

Reduce the size of resources sent to the browser. Minify JavaScript and CSS files to remove unnecessary characters. Compress images and use modern formats like WebP or AVIF that provide better compression than JPEG or PNG.

Implement code splitting to load only the JavaScript needed for the current page. Defer non-critical resources and prioritize loading of above-the-fold content. Use lazy loading for images and other media that appear below the fold.

Leverage browser caching by setting appropriate cache headers. Use a content delivery network to serve static assets from locations closer to your users. Enable compression at the server level using gzip or Brotli.

Optimizing Rendering Performance

Minimize layout thrashing by batching DOM reads and writes. Avoid forced synchronous layouts that trigger unnecessary recalculations. Use CSS transforms and opacity for animations as they can be optimized by the browser.

Reduce the complexity of CSS selectors and avoid deep nesting. Simplify paint complexity by reducing the number of elements that need to be painted. Use will-change CSS property judiciously to hint at upcoming changes.

Optimizing JavaScript Performance

Parse and compile time for JavaScript can be significant, especially on mobile devices. Ship less JavaScript by removing unused code and dependencies. Consider whether you really need that large framework or if a lighter alternative would suffice.

Avoid long-running JavaScript tasks that block the main thread. Break up long tasks into smaller chunks using requestIdleCallback or setTimeout. Use Web Workers for CPU-intensive operations to keep the main thread responsive.

Network Optimization

Reduce the number of network requests by bundling resources appropriately. Use HTTP/2 or HTTP/3 to enable multiplexing and reduce connection overhead. Implement resource hints like preconnect and prefetch to speed up future navigations.

Optimize your API calls by implementing proper caching strategies. Consider using GraphQL to request only the data you need. Implement pagination or infinite scrolling for large data sets rather than loading everything at once.

Monitoring and Iteration

Performance optimization is not a one-time task but an ongoing process. Set up monitoring to track performance metrics over time. Establish performance budgets and integrate performance testing into your continuous integration pipeline.

Regularly audit your site for performance issues and address regressions quickly. Keep dependencies updated but be mindful of the performance impact of new versions. Test performance on real devices and network conditions that match your user base.`,
      minWordCount: 450
    },
    metadata: {
      difficulty: 'hard',
      hasAds: false,
      hasSidebar: true,
      hasComments: false,
      htmlComplexity: 'complex'
    }
  },

  // Continue in next artifact due to length...
];
