using System;
using System.Text;
using NUnit.Framework;
using Moq;
using System.Web;
using System.IO;
using MvcMiniProfiler.Filter;

namespace MvcMiniProfiler.Tests.Filter
{
    [TestFixture]
    public class EndOfBodyTests : TestContainer
    {
        private Mock<HttpResponseBase> _response;
        private InsertMarkupFilter _stream;
        private MemoryStream _memoryStream;

        public override void  Setup()
        {
            _response = Factory.Create<HttpResponseBase>();
            _memoryStream = new MemoryStream();
            _response.Setup(r => r.Filter).Returns(_memoryStream);
            _response.Setup(r => r.ContentEncoding).Returns(Encoding.UTF8);
            _stream = new InsertMarkupFilter(_response.Object);
        }

        [Test]
        public void Should_Correctly_Insert_Text_For_Html_Page()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => { eofDetected = true; s.Write("<div>my Information</div>"); };

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("<html><he");
            writeBytes("ad>");
            writeBytes("<ti");
            writeBytes("tle>My Html</title></head>");
            writeBytes("<body><d");
            writeBytes("iv>Header</div>");
            writeBytes("<div>Content</div><div>footer</div>");
            writeBytes("</body></html>");

            string expectedhtml = "<html><head><title>My Html</title></head><body><div>Header</div><div>Content</div><div>footer</div>" +
                                  "<div>my Information</div></body></html>";


            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo(expectedhtml));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            var bytes = Encoding.UTF8.GetBytes("</body></html>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body></html>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Write_Data_After_End_Of_Body()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            var bytes = Encoding.UTF8.GetBytes("</body></html><!--- Other data -->");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body></html><!--- Other data -->"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body_With_Space()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            var bytes = Encoding.UTF8.GetBytes("</body> \r \n \r  </html>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body> \r \n \r  </html>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body_With_Space_Ignoring_Case()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            var bytes = Encoding.UTF8.GetBytes("</Body> \r\n  \r  </hTml>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</Body> \r\n  \r  </hTml>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body_With_Space_Ignoring_Case_And_Other_Text()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += (s) => { eofDetected = true; s.Write("<myDiv>"); };

            var bytes = Encoding.UTF8.GetBytes("as<div>dfa</div>sdfsdf</Body>     </hTml>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("as<div>dfa</div>sdfsdf<myDiv></Body>     </hTml>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body_Across_Writes()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("</body>");
            writeBytes("</html>");

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body></html>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Detect_End_Of_Body_Across_Writes_And_Tag_Boundaries()
        {
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            Action<string> writeBytes = t =>
            {
                var bytes = Encoding.UTF8.GetBytes(t);
                _stream.Write(bytes, 0, bytes.Length);
            };

            writeBytes("</bo");
            writeBytes("dy></h");
            writeBytes("tml>");

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body></html>"));

            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Write_Any_Data_Directly_To_The_Stream()
        {
            var originalText = "abcdefghi؎";
            var bytes = Encoding.UTF8.GetBytes(originalText);

            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo(originalText));
            Assert.IsFalse(eofDetected);
        }

        [Test]
        public void Should_Not_Write_Any_Data_When_Possible_End_Of_Body()
        {
            var originalText = "abcdefghi</Bod";
            var bytes = Encoding.UTF8.GetBytes(originalText);

            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo("abcdefghi"));
            Assert.IsFalse(eofDetected);

            bytes = Encoding.UTF8.GetBytes("y></HtMl>");

            _stream.Write(bytes, 0, bytes.Length);

            originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());

            Assert.That(originalStreamContent, Is.EqualTo("abcdefghi</Body></HtMl>"));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Insert_Text_Correctly_Into_Mvc_Test_Page()
        {
            string html = ReadTestData("Filter.mvcTestPage.html");
            
            var eofDetected = false;
            _stream.EndOfBodyDetected += s => eofDetected = true;

            var bytes = Encoding.UTF8.GetBytes(html);
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo(html));
            Assert.IsTrue(eofDetected);
        }

        [Test]
        public void Should_Not_Signal_End_Of_Body_Twice()
        {
            int signalCount = 0;
            _stream.EndOfBodyDetected += s => signalCount++;

            var bytes = Encoding.UTF8.GetBytes("</body></body></html>");
            _stream.Write(bytes, 0, bytes.Length);

            var originalStreamContent = Encoding.UTF8.GetString(_memoryStream.ToArray());
            Assert.That(originalStreamContent, Is.EqualTo("</body></body></html>"));
            Assert.That(signalCount, Is.EqualTo(1));
        }
    }
}
